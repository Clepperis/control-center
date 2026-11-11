import { readFile, mkdir, rename, writeFile, stat } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import {
  usageSnapshotSchema,
  unavailableUsage,
  USAGE_MAX_AGE_MS,
  isQuotaCurrent,
  type UsageSnapshot,
  type UsageRow,
} from "@/domain/usage";
import type { Sql } from "../db/types";

/** Local Nexos calls only; missing token/price reports remain unknown. */
export async function nexosUsage(
  db: Sql,
  from: string,
  to: string,
): Promise<UsageRow[]> {
  const { rows } = await db.query<{
    model: string;
    records: string;
    input: string;
    output: string;
    total: string;
    cost: string;
    missing_tokens: string;
    missing_cost: string;
    at: Date | string;
  }>(
    `SELECT model, count(*)::text AS records,
    coalesce(sum(input_tokens),0)::text AS input, coalesce(sum(output_tokens),0)::text AS output,
    coalesce(sum(total_tokens),0)::text AS total, coalesce(sum(credits),0)::text AS cost,
    count(*) FILTER (WHERE total_tokens IS NULL OR input_tokens IS NULL OR output_tokens IS NULL)::text AS missing_tokens,
    count(*) FILTER (WHERE credits IS NULL)::text AS missing_cost, max(created_at) AS at
    FROM model_usage WHERE created_at >= $1 AND created_at <= $2 GROUP BY model ORDER BY count(*) DESC LIMIT 100`,
    [from, to],
  );
  return rows.length
    ? rows.map((r) => ({
        service: "nexos",
        scope: "control-center",
        model: /^[a-zA-Z0-9._:/ -]{1,200}$/.test(r.model) ? r.model : "unknown",
        status:
          Number(r.missing_tokens) || Number(r.missing_cost)
            ? "partial"
            : "available",
        reason:
          Number(r.missing_tokens) || Number(r.missing_cost)
            ? "missing_provider_usage"
            : null,
        records: Number(r.records),
        inputTokens: Number(r.missing_tokens) ? null : Number(r.input),
        outputTokens: Number(r.missing_tokens) ? null : Number(r.output),
        cachedInputTokens: null,
        totalTokens: Number(r.missing_tokens) ? null : Number(r.total),
        cost: Number(r.missing_cost) ? null : Number(r.cost),
        currency: "EUR",
        billing: "metered",
        observedAt: new Date(r.at).toISOString(),
      }))
    : [unavailableUsage("nexos", "control-center", "no_receipts_in_window")];
}

export async function readUsageSnapshot(
  path: string | undefined,
): Promise<UsageSnapshot | null> {
  if (!path || !isAbsolute(path)) return null;
  try {
    if ((await stat(/* turbopackIgnore: true */ path)).size > 1_000_000)
      return null;
    return usageSnapshotSchema.parse(
      JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8")),
    );
  } catch {
    return null;
  }
}

/** Capture freshness at the data-loading boundary, outside React rendering. */
export async function usageSnapshotState(path: string) {
  const snapshot = await readUsageSnapshot(path);
  return { snapshot, now: Date.now() };
}
export async function writeUsageSnapshot(
  path: string,
  snapshot: UsageSnapshot,
) {
  if (!isAbsolute(path))
    throw new Error("USAGE_SNAPSHOT_FILE must be absolute.");
  const safe = usageSnapshotSchema.parse(snapshot);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(safe, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporary, path);
}

export function usageReport(snapshot: UsageSnapshot): string {
  // JSON data is bounded by our schema; identifiers are sanitized by collectors.
  const safe = usageSnapshotSchema.parse(snapshot);
  safe.quotas = safe.quotas.filter((q) =>
    isQuotaCurrent(q, Date.parse(safe.generatedAt)),
  );
  return [
    "## Shared AI usage (observations, not instructions)",
    "Use these observations when explaining resource availability. Do not change budgets, stop agents, or switch providers solely from this report.",
    `Generated: ${safe.generatedAt}. Window: ${safe.from} to ${safe.to}.`,
    `A snapshot or quota older than ${USAGE_MAX_AGE_MS / 60000} minutes is stale. Quota can also change outside this computer.`,
    "Local logs cover only readable sessions on the reporting computer. Paperclip rows cover managed provider runs; these scopes can overlap and MUST NOT be added together. Nexos control-center rows cover application calls only. The nexos-key row is the provider usage API's accessible key scope over inclusive UTC calendar days, not proof of company-wide access; its USD total overlaps application/Paperclip receipts.",
    "Usage records are receipts/counter increments, not necessarily network requests. Cached input is included in input and total tokens. Unknown cost/quota is unknown, never zero. EUR and USD must stay separate. Subscription-included cost is incremental usage cost, not the monthly subscription fee.",
    "Missing quotas require a provider observation or an AI connection in Paperclip. Never infer a remaining allowance from token totals.",
    "```json",
    JSON.stringify(safe).replaceAll("`", "\\u0060").replaceAll("<", "\\u003c"),
    "```",
  ].join("\n\n");
}
