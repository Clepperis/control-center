import { z } from "zod";
import { IntegrationError, requestJson, type Fetcher } from "./errors";
import type { UsageRow } from "@/domain/usage";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const reportSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  granularity: z.literal("total"),
  totals: z.object({
    requests: count,
    tokens_total: count,
    tokens_output: count,
    tokens_reasoning: count,
    tokens_audio_output: count,
    tokens_image_output: count,
    tokens_cache_read: count,
    tokens_image_cache_read: count,
    cost_total: z.number().finite().nonnegative(),
  }),
});

/** The API key determines the accessible scope. Never claims company-wide access. */
export async function nexosKeyUsage(
  apiKey: string,
  from: string,
  to: string,
  fetcher: Fetcher = fetch,
): Promise<UsageRow> {
  if (!apiKey.trim()) throw new IntegrationError("configuration");
  const query = new URLSearchParams({
    from: from.slice(0, 10),
    to: to.slice(0, 10),
    granularity: "total",
    timezone: "UTC",
  });
  const parsed = reportSchema.safeParse(
    await requestJson(
      fetcher,
      `https://api.nexos.ai/v1/usage?${query}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      { timeoutMs: 15000 },
    ),
  );
  if (
    !parsed.success ||
    parsed.data.from !== from.slice(0, 10) ||
    parsed.data.to !== to.slice(0, 10)
  )
    throw new IntegrationError("malformed");
  const t = parsed.data.totals;
  // Provider splits reasoning/image/audio from output. Total is authoritative.
  const output =
    t.tokens_output +
    t.tokens_reasoning +
    t.tokens_audio_output +
    t.tokens_image_output;
  const cached = t.tokens_cache_read + t.tokens_image_cache_read;
  const input = t.tokens_total - output;
  if (input < cached) throw new IntegrationError("malformed");
  return {
    service: "nexos",
    scope: "nexos-key",
    status: "available",
    reason: null,
    model: "All accessible models",
    records: t.requests,
    inputTokens: input,
    cachedInputTokens: cached,
    outputTokens: output,
    totalTokens: t.tokens_total,
    cost: t.cost_total,
    currency: "USD",
    billing: "metered",
    observedAt: new Date().toISOString(),
  };
}
