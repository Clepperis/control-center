import { z } from "zod";
import { IntegrationError, requestJson, type Fetcher } from "./errors";
import type { PaperclipConfig } from "@/server/config";
import { unavailableUsage, type UsageRow } from "@/domain/usage";

const count = z.number().int().nonnegative();
const spendSchema = z
  .array(
    z.object({
      provider: z.string(),
      biller: z.string(),
      model: z.string().min(1).max(200),
      billingType: z.string(),
      costCents: z.number().finite().nonnegative(),
      eventCount: count,
      estimatedEventCount: count,
      unpricedEventCount: count,
      inputTokens: count,
      cachedInputTokens: count,
      outputTokens: count,
    }),
  )
  .max(250);
const fileSchema = z.object({
  content: z.string().max(1_000_000),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Separate telemetry contract: never enables delegation or changes budgets/cost events. */
export class PaperclipUsageClient {
  constructor(
    private config: PaperclipConfig,
    private fetcher: Fetcher = fetch,
  ) {}
  private request(path: string, method = "GET", body?: unknown) {
    return requestJson(
      this.fetcher,
      `${this.config.baseUrl}/api${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      { timeoutMs: 15000, mutation: method !== "GET" },
    );
  }
  async usage(from: string, to: string): Promise<UsageRow[]> {
    const params = new URLSearchParams({ from, to });
    const raw = await this.request(
      `/companies/${this.config.companyId}/costs/by-provider?${params}`,
    );
    const parsed = spendSchema.safeParse(raw);
    if (!parsed.success) throw new IntegrationError("malformed");
    const rows: UsageRow[] = parsed.data.flatMap((r) => {
      const service =
        r.biller === "nexos" || r.biller === "nexos.ai"
          ? "nexos"
          : r.provider === "anthropic"
            ? "claude"
            : r.provider === "openai"
              ? "codex"
              : null;
      if (!service) return [];
      const unknown =
        r.unpricedEventCount > 0 ||
        r.estimatedEventCount > 0 ||
        (r.billingType === "unknown" && r.costCents === 0);
      return [
        {
          service,
          scope: "paperclip",
          model: /^[a-zA-Z0-9._:/ -]{1,200}$/.test(r.model)
            ? r.model
            : "unknown",
          status: unknown ? "partial" : "available",
          reason: unknown ? "unpriced_or_estimated_cost" : null,
          records: r.eventCount,
          inputTokens: r.inputTokens + r.cachedInputTokens,
          cachedInputTokens: r.cachedInputTokens,
          outputTokens: r.outputTokens,
          totalTokens: r.inputTokens + r.cachedInputTokens + r.outputTokens,
          cost: unknown ? null : r.costCents / 100,
          currency: "USD",
          billing:
            r.billingType === "subscription_included"
              ? "subscription_included"
              : r.billingType === "api"
                ? "metered"
                : "unknown",
          observedAt: null, // Aggregate has no provider receipt timestamp; snapshot time is separate.
        } satisfies UsageRow,
      ];
    });
    for (const service of ["claude", "codex"] as const)
      if (!rows.some((r) => r.service === service))
        rows.push(
          unavailableUsage(service, "paperclip", "no_receipts_in_window"),
        );
    return rows;
  }
  /** Only replaces our marked data section, with optimistic concurrency on AGENTS.md. */
  async publish(agentId: string, report: string) {
    z.uuid().parse(agentId);
    const agent = z
      .object({ companyId: z.string() })
      .safeParse(await this.request(`/agents/${agentId}`));
    if (!agent.success || agent.data.companyId !== this.config.companyId)
      throw new IntegrationError("authentication");
    const path = `/agents/${agentId}/instructions-bundle/file`;
    const parsed = fileSchema.safeParse(
      await this.request(`${path}?path=AGENTS.md`),
    );
    if (!parsed.success) throw new IntegrationError("malformed");
    const content = mergeUsageReport(parsed.data.content, report);
    if (content === parsed.data.content) return;
    // No blind retries after uncertain writes. Next sync reads current content/hash again.
    await this.request(path, "PUT", {
      path: "AGENTS.md",
      content,
      baseHash: parsed.data.contentHash,
    });
  }
}

export const USAGE_START = "<!-- BEGIN CONTROL CENTER USAGE -->";
export const USAGE_END = "<!-- END CONTROL CENTER USAGE -->";
export function mergeUsageReport(content: string, report: string): string {
  const start = content.indexOf(USAGE_START),
    end = content.indexOf(USAGE_END);
  const block = `${USAGE_START}\n${report}\n${USAGE_END}`;
  if (start === -1 && end === -1)
    return `${content}${content.endsWith("\n") ? "\n" : "\n\n"}${block}\n`;
  if (
    start < 0 ||
    end < start ||
    content.indexOf(USAGE_START, start + 1) !== -1 ||
    content.indexOf(USAGE_END, end + 1) !== -1
  )
    throw new IntegrationError("malformed");
  return (
    content.slice(0, start) + block + content.slice(end + USAGE_END.length)
  );
}
