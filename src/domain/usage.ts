import { z } from "zod";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const usageRowSchema = z.object({
  service: z.enum(["nexos", "claude", "codex"]),
  scope: z.enum(["control-center", "local", "paperclip", "nexos-key"]),
  status: z.enum(["available", "partial", "unavailable"]),
  reason: z.string().max(100).nullable(),
  model: z.string().max(200),
  records: count.nullable(),
  inputTokens: count.nullable(),
  cachedInputTokens: count.nullable(),
  outputTokens: count.nullable(),
  totalTokens: count.nullable(),
  cost: z.number().finite().nonnegative().nullable(),
  currency: z.enum(["EUR", "USD"]).nullable(),
  billing: z.enum(["metered", "subscription_included", "unknown"]),
  observedAt: z.iso.datetime().nullable(),
});
export type UsageRow = z.infer<typeof usageRowSchema>;
export const quotaSchema = z.object({
  service: z.enum(["claude", "codex"]),
  label: z.string().max(100),
  usedPercent: z.number().finite().min(0).max(100),
  resetsAt: z.iso.datetime().nullable(),
  observedAt: z.iso.datetime(),
});
export type UsageQuota = z.infer<typeof quotaSchema>;
export const usageSnapshotSchema = z.object({
  version: z.literal(1),
  generatedAt: z.iso.datetime(),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  rows: z.array(usageRowSchema).max(300),
  quotas: z.array(quotaSchema).max(20),
});
export type UsageSnapshot = z.infer<typeof usageSnapshotSchema>;
export const USAGE_MAX_AGE_MS = 15 * 60 * 1000;

export function isQuotaCurrent(quota: UsageQuota, now: number): boolean {
  const age = now - Date.parse(quota.observedAt);
  return (
    Number.isFinite(now) &&
    age >= 0 &&
    age < USAGE_MAX_AGE_MS &&
    (quota.resetsAt === null || Date.parse(quota.resetsAt) > now)
  );
}

export function unavailableUsage(
  service: UsageRow["service"],
  scope: UsageRow["scope"],
  reason: string,
): UsageRow {
  return {
    service,
    scope,
    reason,
    status: "unavailable",
    model: "unknown",
    records: null,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    totalTokens: null,
    cost: null,
    currency: null,
    billing: "unknown",
    observedAt: null,
  };
}
