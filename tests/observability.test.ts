import { describe, it, expect, vi } from "vitest";
import { resolve } from "node:path";
import { formatEvent, logEvent } from "../src/server/observability/log";
import {
  DatabaseUsageSink,
  trackModelCall,
  type UsageEntry,
  type UsageSink,
} from "../src/server/observability/usage";
import { NexosGateway } from "../src/integrations/nexos";
import { NexosPlatformPlanner } from "../src/server/improvements/planner";
import { IntegrationError, type Fetcher } from "../src/integrations/errors";
import type { Improvement } from "../src/domain/improvements";
import { migrate } from "../src/server/db/migrate";
import { openTestDatabase } from "./pglite";

const config = {
  apiKey: "synthetic-not-a-real-key",
  model: "synthetic-model",
  timeoutMs: 1000,
  maxTokens: 1200,
  enabled: true,
};
const answer = (usage?: Record<string, number>, kind = "answer") =>
  Response.json({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify(
            kind === "answer"
              ? { kind: "answer", reply: "Sintetinis atsakymas." }
              : { kind: "unknown" },
          ),
        },
      },
    ],
    ...(usage ? { usage } : {}),
  });
const fetcherFor =
  (completion: () => Response): Fetcher =>
  async (url) =>
    String(url).endsWith("/models")
      ? Response.json({ data: [{ id: config.model }] })
      : completion();
function memorySink() {
  const entries: UsageEntry[] = [];
  const sink: UsageSink = {
    async record(entry) {
      entries.push(entry);
    },
  };
  return { entries, sink };
}

describe("structured event log", () => {
  it("writes one JSON line with event name, timestamp and primitive fields", () => {
    const line = formatEvent(
      "model.call",
      { source: "chat", totalTokens: 20, ok: true, missing: undefined },
      new Date("2026-11-11T00:00:00.000Z"),
    );
    expect(line.endsWith("\n")).toBe(true);
    expect(line.trimEnd().includes("\n")).toBe(false);
    expect(JSON.parse(line)).toEqual({
      ts: "2026-11-11T00:00:00.000Z",
      event: "model.call",
      source: "chat",
      totalTokens: 20,
      ok: true,
    });
  });

  it("redacts sensitive keys, strips control characters and truncates long strings", () => {
    const parsed = JSON.parse(
      formatEvent("model.call", {
        apiKey: "synthetic-secret",
        authorization: "Bearer synthetic",
        password: "synthetic",
        cookie: "synthetic",
        note: 'line one\nforged {"event":"x"}',
        long: "x".repeat(500),
        ratio: Number.NaN,
      }),
    );
    expect(parsed.apiKey).toBe("[redacted]");
    expect(parsed.authorization).toBe("[redacted]");
    expect(parsed.password).toBe("[redacted]");
    expect(parsed.cookie).toBe("[redacted]");
    expect(parsed.note).not.toMatch(/[\n\r]/);
    expect(parsed.long.length).toBeLessThanOrEqual(201);
    expect(parsed.ratio).toBeNull();
  });

  it("replaces invalid event names and drops invalid keys instead of throwing", () => {
    const parsed = JSON.parse(
      formatEvent("Bad Event\n", { "bad key": "x", ok: 1 }),
    );
    expect(parsed.event).toBe("invalid_event");
    expect(parsed).not.toHaveProperty("bad key");
    expect(parsed.ok).toBe(1);
  });

  it("never lets a failing writer break the caller", () => {
    expect(() =>
      logEvent("model.call", {}, () => {
        throw new Error("stdout closed");
      }),
    ).not.toThrow();
  });
});

describe("model usage tracking", () => {
  it("records successful calls with reported usage and duration", async () => {
    const { entries, sink } = memorySink();
    const result = await trackModelCall(
      sink,
      { source: "chat", model: "m" },
      async (report) => {
        report({ inputTokens: 3, outputTokens: 4, totalTokens: 7, credits: 2 });
        return "ok";
      },
      () => undefined,
    );
    expect(result).toBe("ok");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      source: "chat",
      model: "m",
      outcome: "ok",
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
      credits: 2,
    });
    expect(entries[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records failures with the integration error code and rethrows the original error", async () => {
    const { entries, sink } = memorySink();
    const error = new IntegrationError("rate_limit");
    await expect(
      trackModelCall(
        sink,
        { source: "improvement", model: "m" },
        async () => {
          throw error;
        },
        () => undefined,
      ),
    ).rejects.toBe(error);
    expect(entries[0]).toMatchObject({
      outcome: "error",
      errorCode: "rate_limit",
    });
  });

  it("keeps usage already reported before a later validation failure", async () => {
    const { entries, sink } = memorySink();
    await expect(
      trackModelCall(
        sink,
        { source: "chat", model: "m" },
        async (report) => {
          report({ totalTokens: 50 });
          throw new IntegrationError("malformed");
        },
        () => undefined,
      ),
    ).rejects.toThrow("malformed");
    expect(entries[0]).toMatchObject({
      outcome: "error",
      errorCode: "malformed",
      totalTokens: 50,
    });
  });

  it("logs and survives a failing sink without changing the call result", async () => {
    const lines: string[] = [];
    const broken: UsageSink = {
      async record() {
        throw new Error("database down");
      },
    };
    const result = await trackModelCall(
      broken,
      { source: "chat", model: "m" },
      async () => 42,
      (line) => lines.push(line),
    );
    expect(result).toBe(42);
    const events = lines.map((l) => JSON.parse(l).event);
    expect(events).toContain("model.call");
    expect(events).toContain("model.usage_record_failed");
  });

  it("persists rows through the 007 migration", async () => {
    const db = await openTestDatabase();
    try {
      await migrate(db, resolve("db/migrations"));
      const sink = new DatabaseUsageSink(db);
      await sink.record({
        source: "knowledge",
        model: "synthetic-model",
        outcome: "ok",
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        credits: 0.25,
        durationMs: 12,
      });
      await sink.record({
        source: "chat",
        model: "synthetic-model",
        outcome: "error",
        errorCode: "timeout",
        durationMs: 1000,
      });
      const rows = await db.query<{
        source: string;
        outcome: string;
        error_code: string | null;
        total_tokens: number | null;
        credits: string | null;
      }>(
        "SELECT source,outcome,error_code,total_tokens,credits::text AS credits FROM model_usage ORDER BY source",
      );
      expect(rows.rows).toEqual([
        {
          source: "chat",
          outcome: "error",
          error_code: "timeout",
          total_tokens: null,
          credits: null,
        },
        {
          source: "knowledge",
          outcome: "ok",
          error_code: null,
          total_tokens: 15,
          credits: "0.25",
        },
      ]);
      await expect(
        sink.record({
          source: "chat",
          model: "m",
          outcome: "ok",
          totalTokens: -1,
          durationMs: 1,
        }),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });
});

describe("gateway and planner usage recording", () => {
  it("records chat completions with model, tokens and credits", async () => {
    const { entries, sink } = memorySink();
    const gateway = new NexosGateway(
      config,
      fetcherFor(() =>
        answer({
          prompt_tokens: 12,
          completion_tokens: 8,
          total_tokens: 20,
          nexos_credits_cost: 1.5,
        }),
      ),
      sink,
    );
    await gateway.complete([{ role: "user", content: "Klausimas" }], []);
    expect(entries).toEqual([
      expect.objectContaining({
        source: "chat",
        model: "synthetic-model",
        outcome: "ok",
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
        credits: 1.5,
      }),
    ]);
  });

  it("labels grounded turns as knowledge and records malformed replies as errors with spent tokens", async () => {
    const { entries, sink } = memorySink();
    const gateway = new NexosGateway(
      config,
      fetcherFor(() => answer({ total_tokens: 33 }, "broken")),
      sink,
    );
    await expect(
      gateway.complete(
        [{ role: "user", content: "Klausimas" }],
        [],
        undefined,
        [],
        {
          status: "empty",
          scope: null,
          passages: [],
          cited: [],
        },
      ),
    ).rejects.toMatchObject({ code: "malformed" });
    expect(entries[0]).toMatchObject({
      source: "knowledge",
      outcome: "error",
      errorCode: "malformed",
      totalTokens: 33,
    });
  });

  it("records nothing when model calls are disabled", async () => {
    const { entries, sink } = memorySink();
    const fetcher = vi.fn<Fetcher>();
    const gateway = new NexosGateway(
      { ...config, enabled: false },
      fetcher,
      sink,
    );
    await expect(
      gateway.complete([{ role: "user", content: "Klausimas" }], []),
    ).rejects.toMatchObject({ code: "disabled" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(entries).toHaveLength(0);
  });

  it("records Platform Engineer planner usage as improvement", async () => {
    const { entries, sink } = memorySink();
    const planner = new NexosPlatformPlanner(
      config,
      fetcherFor(() =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({ reply: "Aptarkime.", plan: null }),
              },
            },
          ],
          usage: { prompt_tokens: 40, completion_tokens: 10, total_tokens: 50 },
        }),
      ),
      sink,
    );
    const request = {
      messages: [{ role: "user", text: "Aptarkime pakeitimą" }],
      plan: null,
      state: "discussing",
      external: null,
      error: null,
      candidate: null,
    } as unknown as Improvement;
    await planner.respond(request, null, [], false);
    expect(entries[0]).toMatchObject({
      source: "improvement",
      model: "synthetic-model",
      outcome: "ok",
      totalTokens: 50,
    });
  });
});
