import { randomUUID } from "node:crypto";
import type { Usage } from "@/domain/orchestration";
import { IntegrationError } from "@/integrations/errors";
import type { Sql } from "../db/types";
import { logEvent, type LogWriter } from "./log";

export type UsageSource = "chat" | "knowledge" | "improvement";
export type UsageOutcome = "ok" | "error";

export interface UsageEntry {
  source: UsageSource;
  model: string;
  outcome: UsageOutcome;
  errorCode?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  credits?: number;
  durationMs: number;
}

export interface UsageSink {
  record(entry: UsageEntry): Promise<void>;
}

/** Log-only: used where no application database is configured. */
export const logOnlyUsageSink: UsageSink = {
  async record() {},
};

export class DatabaseUsageSink implements UsageSink {
  constructor(private db: Sql) {}
  async record(entry: UsageEntry): Promise<void> {
    await this.db.query(
      "INSERT INTO model_usage(id,source,model,outcome,error_code,input_tokens,output_tokens,total_tokens,credits,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        randomUUID(),
        entry.source,
        entry.model,
        entry.outcome,
        entry.errorCode ?? null,
        entry.inputTokens ?? null,
        entry.outputTokens ?? null,
        entry.totalTokens ?? null,
        entry.credits ?? null,
        entry.durationMs,
      ],
    );
  }
}

export function usageErrorCode(error: unknown): string {
  return error instanceof IntegrationError ? error.code : "unexpected";
}

async function recordSafely(
  sink: UsageSink,
  entry: UsageEntry,
  write?: LogWriter,
): Promise<void> {
  logEvent("model.call", { ...entry }, write);
  try {
    await sink.record(entry);
  } catch (error) {
    logEvent(
      "model.usage_record_failed",
      { source: entry.source, reason: usageErrorCode(error) },
      write,
    );
  }
}

/**
 * Measures one paid model call. `report` is called as soon as provider usage
 * is known, so tokens spent on a reply that later fails validation still count.
 * Recording never alters the call's result or error.
 */
export async function trackModelCall<T>(
  sink: UsageSink,
  call: { source: UsageSource; model: string },
  run: (report: (usage: Usage | null) => void) => Promise<T>,
  write?: LogWriter,
): Promise<T> {
  const started = performance.now();
  let usage: Usage | null = null;
  const report = (value: Usage | null) => {
    usage = value;
  };
  const entry = (outcome: UsageOutcome, errorCode?: string): UsageEntry => ({
    ...call,
    ...(usage ?? {}),
    outcome,
    errorCode,
    durationMs: Math.max(0, Math.round(performance.now() - started)),
  });
  try {
    const result = await run(report);
    await recordSafely(sink, entry("ok"), write);
    return result;
  } catch (error) {
    await recordSafely(sink, entry("error", usageErrorCode(error)), write);
    throw error;
  }
}
