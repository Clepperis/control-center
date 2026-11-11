import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { migrate } from "../src/server/db/migrate";
import type { Database } from "../src/server/db/types";
import { usageStatistics } from "../src/server/observability/stats";
import { UsageStatisticsBody } from "../src/components/statistics";
import { openTestDatabase } from "./pglite";

let db: Database;
async function row(
  daysAgo: number,
  source: string,
  model: string,
  outcome: "ok" | "error",
  totalTokens: number | null,
  credits: number | null,
) {
  await db.query(
    `INSERT INTO model_usage(id,created_at,source,model,outcome,error_code,total_tokens,credits,duration_ms)
     VALUES($1, now() - make_interval(days => $2), $3, $4, $5, $6, $7, $8, 10)`,
    [
      randomUUID(),
      daysAgo,
      source,
      model,
      outcome,
      outcome === "error" ? "timeout" : null,
      totalTokens,
      credits,
    ],
  );
}
beforeEach(async () => {
  db = await openTestDatabase();
  await migrate(db, resolve("db/migrations"));
});
afterEach(async () => {
  await db.close();
});

describe("usage statistics", () => {
  it("aggregates calls, errors, tokens and credits inside the window only", async () => {
    await row(0, "chat", "m-fast", "ok", 100, 1.5);
    await row(0, "chat", "m-fast", "error", 20, null);
    await row(1, "knowledge", "m-standard", "ok", 300, 2.25);
    await row(2, "improvement", "m-strong", "ok", null, null);
    await row(45, "chat", "m-fast", "ok", 9999, 99);

    const stats = await usageStatistics(db, 30);

    expect(stats.days).toBe(30);
    expect(stats.totals).toEqual({
      calls: 4,
      errors: 1,
      totalTokens: 420,
      credits: 3.75,
    });
    expect(stats.bySource).toEqual([
      { key: "chat", calls: 2, errors: 1, totalTokens: 120, credits: 1.5 },
      { key: "improvement", calls: 1, errors: 0, totalTokens: 0, credits: 0 },
      {
        key: "knowledge",
        calls: 1,
        errors: 0,
        totalTokens: 300,
        credits: 2.25,
      },
    ]);
    expect(stats.byModel.map((m) => [m.key, m.calls])).toEqual([
      ["m-fast", 2],
      ["m-standard", 1],
      ["m-strong", 1],
    ]);
    expect(stats.byDay).toHaveLength(3);
    expect(stats.byDay[0].key > stats.byDay[2].key).toBe(true);
    expect(stats.byDay.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.key))).toBe(
      true,
    );
  });

  it("returns zeros for an empty window", async () => {
    const stats = await usageStatistics(db, 7);
    expect(stats.totals).toEqual({
      calls: 0,
      errors: 0,
      totalTokens: 0,
      credits: 0,
    });
    expect(stats.byDay).toEqual([]);
  });

  it("rejects unbounded windows", async () => {
    await expect(usageStatistics(db, 0)).rejects.toThrow();
    await expect(usageStatistics(db, 91)).rejects.toThrow();
    await expect(usageStatistics(db, 1.5)).rejects.toThrow();
  });
});

describe("statistics view", () => {
  it("renders Lithuanian totals and grouped tables", async () => {
    await row(0, "chat", "m-fast", "ok", 100, 1.5);
    await row(0, "knowledge", "m-standard", "error", 50, null);
    const html = renderToStaticMarkup(
      createElement(UsageStatisticsBody, {
        stats: await usageStatistics(db, 30),
      }),
    );
    expect(html).toContain("Requests");
    expect(html).toContain("Chat");
    expect(html).toContain("Knowledge");
    expect(html).toContain("m-standard");
    expect(html).toContain("<caption");
  });

  it("renders an honest empty state without data", () => {
    const html = renderToStaticMarkup(
      createElement(UsageStatisticsBody, { stats: null }),
    );
    expect(html).toContain("PostgreSQL");
  });
});
