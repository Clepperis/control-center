import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  LocalUsageReader,
  readLocalUsage,
} from "../src/server/observability/local-usage";
import {
  nexosUsage,
  readUsageSnapshot,
  writeUsageSnapshot,
  usageReport,
} from "../src/server/observability/usage-snapshot";
import {
  PaperclipUsageClient,
  mergeUsageReport,
  USAGE_START,
  USAGE_END,
} from "../src/integrations/paperclip-usage";
import { CombinedUsage } from "../src/components/combined-usage";
import { nexosKeyUsage } from "../src/integrations/nexos-usage";
import { unavailableUsage, type UsageSnapshot } from "../src/domain/usage";
import { openTestDatabase } from "./pglite";
import { migrate } from "../src/server/db/migrate";
import type { Fetcher } from "../src/integrations/errors";

const from = "2026-11-01T00:00:00.000Z",
  to = "2026-11-11T12:00:00.000Z";
const at = "2026-11-11T10:00:00.000Z";
const snapshot = (): UsageSnapshot => ({
  version: 1,
  generatedAt: at,
  from,
  to,
  rows: [unavailableUsage("claude", "local", "logs_unavailable")],
  quotas: [],
});
const line = (reader: LocalUsageReader, value: unknown) =>
  reader.line(JSON.stringify(value));
function codex(
  reader: LocalUsageReader,
  input: number,
  cached: number,
  output: number,
  timestamp = at,
) {
  line(reader, {
    type: "event_msg",
    timestamp,
    payload: {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: input,
          cached_input_tokens: cached,
          output_tokens: output,
          total_tokens: input + output,
        },
      },
    },
  });
}
function session(reader: LocalUsageReader) {
  line(reader, {
    type: "session_meta",
    payload: {
      id: "synthetic-session",
      originator: "Codex Desktop",
      base_instructions: "SYNTHETIC SECRET",
    },
  });
  line(reader, { type: "turn_context", payload: { model: "synthetic-model" } });
}

describe("local usage receipts", () => {
  it("counts Codex cumulative deltas only inside the window and deduplicates repeated/copied logs", () => {
    const reader = new LocalUsageReader("codex");
    session(reader);
    codex(reader, 100, 80, 10, "2026-10-31T00:00:00.000Z");
    codex(reader, 160, 120, 20);
    codex(reader, 160, 120, 20);
    reader.file();
    session(reader);
    codex(reader, 100, 80, 10, "2026-10-31T00:00:00.000Z");
    codex(reader, 160, 120, 20);
    codex(reader, 200, 150, 25, "2026-11-11T11:00:00.000Z");
    const { rows } = reader.result(from, to);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      records: 2,
      inputTokens: 100,
      cachedInputTokens: 70,
      outputTokens: 15,
      totalTokens: 115,
      cost: null,
    });
    expect(JSON.stringify(rows)).not.toContain("SECRET");
  });
  it("deduplicates Claude streaming blocks and includes cache reads/writes once", () => {
    const reader = new LocalUsageReader("claude");
    const receipt = {
      type: "assistant",
      requestId: "synthetic-request",
      timestamp: at,
      message: {
        id: "synthetic-message",
        model: "claude-synthetic",
        content: [{ text: "SYNTHETIC SECRET" }],
        usage: {
          input_tokens: 10,
          cache_read_input_tokens: 50,
          cache_creation_input_tokens: 20,
          output_tokens: 5,
        },
      },
    };
    line(reader, receipt);
    line(reader, receipt);
    line(reader, {
      ...receipt,
      message: {
        ...receipt.message,
        usage: { ...receipt.message.usage, output_tokens: 15 },
      },
    });
    const { rows } = reader.result(from, to);
    expect(rows[0]).toMatchObject({
      records: 1,
      inputTokens: 80,
      cachedInputTokens: 50,
      outputTokens: 15,
      totalTokens: 95,
      cost: null,
      billing: "unknown",
    });
    expect(JSON.stringify(rows)).not.toContain("SECRET");
  });
  it("does not multiply quota percentages and preserves the provider observation time", () => {
    const reader = new LocalUsageReader("codex");
    session(reader);
    line(reader, {
      type: "event_msg",
      timestamp: at,
      payload: {
        type: "token_count",
        rate_limits: {
          primary: { used_percent: 42, resets_at: 1794398400 },
          secondary: { used_percent: 7 },
        },
      },
    });
    expect(reader.result(from, to).quotas).toMatchObject([
      { usedPercent: 42, observedAt: at },
      { usedPercent: 7, observedAt: at },
    ]);
  });
  it("marks broken logs partial, skips counter resets, and rejects malformed usage", () => {
    const reader = new LocalUsageReader("codex");
    session(reader);
    codex(reader, 100, 80, 10);
    reader.line("{broken");
    codex(reader, 10, 8, 1, "2026-11-11T11:00:00.000Z");
    expect(reader.result(from, to).rows[0]).toMatchObject({
      totalTokens: 110,
      status: "partial",
    });
    expect(
      new LocalUsageReader("claude").result(from, to).rows[0].totalTokens,
    ).toBeNull();
  });
  it("represents an inaccessible source as unavailable rather than zero usage", async () => {
    const result = await readLocalUsage(
      "claude",
      [join(tmpdir(), "cc-nonexistent-synthetic-usage-root")],
      from,
      to,
    );
    expect(result.rows[0]).toMatchObject({
      status: "unavailable",
      records: null,
      totalTokens: null,
      cost: null,
    });
  });
});

const config = {
  baseUrl: "https://paperclip.example",
  apiKey: "pcp_board_synthetic",
  companyId: "11111111-1111-4111-8111-111111111111",
  agentIds: [],
  enabled: false,
  contractVerified: false,
};
describe("Paperclip usage awareness", () => {
  it("keeps provider currency and subscription inclusion separate from unknown prices", async () => {
    const fetcher: Fetcher = async () =>
      Response.json([
        {
          provider: "anthropic",
          biller: "anthropic",
          billingType: "subscription_included",
          model: "synthetic",
          eventCount: 2,
          estimatedEventCount: 0,
          unpricedEventCount: 0,
          costCents: 0,
          inputTokens: 10,
          cachedInputTokens: 100,
          outputTokens: 5,
        },
        {
          provider: "openai",
          biller: "openai",
          billingType: "unknown",
          model: "synthetic-codex",
          eventCount: 1,
          estimatedEventCount: 0,
          unpricedEventCount: 1,
          costCents: 0,
          inputTokens: 1,
          cachedInputTokens: 0,
          outputTokens: 1,
        },
      ]);
    const rows = await new PaperclipUsageClient(config, fetcher).usage(
      from,
      to,
    );
    expect(rows[0]).toMatchObject({
      totalTokens: 115,
      cost: 0,
      currency: "USD",
      billing: "subscription_included",
    });
    expect(rows[1]).toMatchObject({ cost: null, status: "partial" });
  });
  it("updates only the marked section and preserves surrounding instructions", () => {
    const original = `Keep me.\n${USAGE_START}\nold\n${USAGE_END}\nKeep me too.`;
    expect(mergeUsageReport(original, "new")).toBe(
      `Keep me.\n${USAGE_START}\nnew\n${USAGE_END}\nKeep me too.`,
    );
    expect(() => mergeUsageReport(`${USAGE_START}\nbroken`, "new")).toThrow();
    const added = mergeUsageReport("Keep me.\n", "new");
    expect(mergeUsageReport(added, "new")).toBe(added);
  });
  it("checks company membership and uses the prior hash when publishing, without cost/budget writes", async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const fetcher: Fetcher = async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body as string | undefined,
      });
      if (String(url).endsWith("/agents/22222222-2222-4222-8222-222222222222"))
        return Response.json({ companyId: config.companyId });
      return Response.json({
        content: "Keep me.\n",
        contentHash: "a".repeat(64),
      });
    };
    await new PaperclipUsageClient(config, fetcher).publish(
      "22222222-2222-4222-8222-222222222222",
      "report",
    );
    expect(calls.map((c) => c.method)).toEqual(["GET", "GET", "PUT"]);
    expect(JSON.parse(calls[2].body!)).toMatchObject({
      path: "AGENTS.md",
      baseHash: "a".repeat(64),
    });
    expect(calls.every((c) => !/cost-events|budgets/.test(c.url))).toBe(true);
  });
});

describe("shared snapshot", () => {
  it("reads Nexos key-scoped UTC totals in USD without double-counting reasoning output", async () => {
    let requested = "";
    const fetcher: Fetcher = async (url) => {
      requested = String(url);
      return Response.json({
        from: from.slice(0, 10),
        to: to.slice(0, 10),
        granularity: "total",
        totals: {
          requests: 2,
          tokens_total: 100,
          tokens_output: 10,
          tokens_reasoning: 5,
          tokens_audio_output: 2,
          tokens_image_output: 3,
          tokens_cache_read: 30,
          tokens_image_cache_read: 10,
          cost_total: 0.1234,
        },
      });
    };
    expect(
      await nexosKeyUsage("synthetic-key", from, to, fetcher),
    ).toMatchObject({
      scope: "nexos-key",
      totalTokens: 100,
      inputTokens: 80,
      cachedInputTokens: 40,
      outputTokens: 20,
      cost: 0.1234,
      currency: "USD",
    });
    expect(requested).toContain("granularity=total");
    expect(requested).toContain("timezone=UTC");
    expect(requested).not.toContain("synthetic-key");
  });
  it("rejects a denied Nexos scope rather than pretending its usage is zero", async () => {
    await expect(
      nexosKeyUsage(
        "synthetic-key",
        from,
        to,
        async () => new Response("denied", { status: 403 }),
      ),
    ).rejects.toMatchObject({ code: "authentication" });
  });
  it("keeps missing Nexos token/price reports unknown", async () => {
    const db = await openTestDatabase();
    try {
      await migrate(db, resolve("db/migrations"));
      await db.query(
        "INSERT INTO model_usage(id,created_at,source,model,outcome,duration_ms) VALUES('11111111-1111-4111-8111-111111111111',$1,'chat','synthetic','ok',1)",
        [at],
      );
      const rows = await nexosUsage(db, from, to);
      expect(rows[0]).toMatchObject({
        records: 1,
        cost: null,
        totalTokens: null,
        currency: "EUR",
        status: "partial",
      });
    } finally {
      await db.close();
    }
  });
  it("roundtrips validated aggregates without including local paths or private content", async () => {
    const root = await mkdtemp(join(tmpdir(), "cc-synthetic-usage-"));
    try {
      const path = join(root, "usage.json");
      await writeUsageSnapshot(path, snapshot());
      expect(await readUsageSnapshot(path)).toEqual(snapshot());
      expect(await readUsageSnapshot(join(root, "missing"))).toBeNull();
      const report = usageReport(snapshot());
      expect(report).toContain("MUST NOT be added together");
      expect(report).toContain("Unknown cost/quota is unknown, never zero");
      expect(report).not.toContain(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("shows stale snapshots and missing quotas without inventing a remaining allowance", () => {
    const html = renderToStaticMarkup(
      createElement(CombinedUsage, {
        snapshot: snapshot(),
        now: Date.parse(to),
      }),
    );
    expect(html).toContain("pasenusi");
    expect(html).toContain("Claude quota: Unavailable");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("0 %");
  });
});
