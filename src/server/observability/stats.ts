import { z } from "zod";
import type { Sql } from "../db/types";

export interface UsageBucket {
  key: string;
  calls: number;
  errors: number;
  totalTokens: number;
  credits: number;
}
export interface UsageStatistics {
  days: number;
  totals: Omit<UsageBucket, "key">;
  byDay: UsageBucket[];
  bySource: UsageBucket[];
  byModel: UsageBucket[];
}

const MAX_DAYS = 90;
const MAX_MODELS = 20;
const windowDays = z.number().int().min(1).max(MAX_DAYS);

// Text casts keep numeric precision and integer sums across pg drivers.
const AGGREGATES = `count(*)::text AS calls,
  count(*) FILTER (WHERE outcome='error')::text AS errors,
  coalesce(sum(total_tokens),0)::text AS total_tokens,
  coalesce(sum(credits),0)::text AS credits`;
const WINDOW = "created_at >= now() - make_interval(days => $1)";

interface Row extends Record<string, unknown> {
  key: string | null;
  calls: string;
  errors: string;
  total_tokens: string;
  credits: string;
}
function toBucket(row: Row): UsageBucket {
  return {
    key: row.key ?? "",
    calls: Number(row.calls),
    errors: Number(row.errors),
    totalTokens: Number(row.total_tokens),
    credits: Number(row.credits),
  };
}

/** Read-only aggregation over model_usage for the last `days` days. */
export async function usageStatistics(
  db: Sql,
  days = 30,
): Promise<UsageStatistics> {
  const window = windowDays.parse(days);
  const grouped = async (key: string, order: string, limit = "") =>
    (
      await db.query<Row>(
        `SELECT ${key} AS key, ${AGGREGATES} FROM model_usage WHERE ${WINDOW} GROUP BY 1 ORDER BY ${order} ${limit}`,
        [window],
      )
    ).rows.map(toBucket);
  const [totals] = (
    await db.query<Row>(
      `SELECT NULL AS key, ${AGGREGATES} FROM model_usage WHERE ${WINDOW}`,
      [window],
    )
  ).rows.map(toBucket);
  return {
    days: window,
    totals: {
      calls: totals.calls,
      errors: totals.errors,
      totalTokens: totals.totalTokens,
      credits: totals.credits,
    },
    byDay: await grouped(
      "to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD')",
      "1 DESC",
    ),
    bySource: await grouped("source", "1"),
    // Order by the numeric count, not the text-cast `calls` column.
    byModel: await grouped("model", "count(*) DESC, 1", `LIMIT ${MAX_MODELS}`),
  };
}
