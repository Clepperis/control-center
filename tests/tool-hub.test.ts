import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { checkToolHubAccess, toolHubOwner } from "../src/server/toolhub/access";
import {
  createToolHubHandler,
  type ToolHubDeps,
  type ToolCallRecord,
} from "../src/server/toolhub/server";
import { DatabaseToolCallSink } from "../src/server/toolhub/audit";
import { migrate } from "../src/server/db/migrate";
import type { Database } from "../src/server/db/types";
import { openTestDatabase } from "./pglite";

const TOKEN = "t".repeat(40);

describe("Tool Hub access", () => {
  it("is disabled without a strong token", () => {
    expect(checkToolHubAccess({}, `Bearer ${TOKEN}`)).toBe("disabled");
    expect(
      checkToolHubAccess({ TOOL_HUB_TOKEN: "short" }, "Bearer short"),
    ).toBe("disabled");
  });
  it("denies a missing or wrong bearer token", () => {
    const env = { TOOL_HUB_TOKEN: TOKEN };
    expect(checkToolHubAccess(env, null)).toBe("denied");
    expect(checkToolHubAccess(env, `Bearer ${"x".repeat(40)}`)).toBe("denied");
    expect(checkToolHubAccess(env, TOKEN)).toBe("denied");
  });
  it("allows the exact bearer token", () => {
    expect(
      checkToolHubAccess({ TOOL_HUB_TOKEN: TOKEN }, `Bearer ${TOKEN}`),
    ).toBe("ok");
  });
  it("acts as the configured owner, and as the development owner only in development", () => {
    expect(toolHubOwner({ OWNER_SUBJECT: "owner-1" })).toBe("owner-1");
    expect(
      toolHubOwner({ AUTH_MODE: "development", NODE_ENV: "development" }),
    ).toBe("development-owner");
    expect(
      toolHubOwner({ AUTH_MODE: "development", NODE_ENV: "production" }),
    ).toBeNull();
    expect(toolHubOwner({})).toBeNull();
  });
});

function fakeDeps(calls: ToolCallRecord[], proposed: unknown[]): ToolHubDeps {
  return {
    async searchKnowledge(query) {
      return [
        {
          citation: "S1",
          title: "Renginiai",
          heading: "Reconnect Alumni",
          content: `Atitikmuo užklausai: ${query}`,
        },
      ];
    },
    async usageStats(days) {
      return {
        days,
        totals: { calls: 2, errors: 0, totalTokens: 300, credits: 0.01 },
        byDay: [],
        bySource: [],
        byModel: [],
      };
    },
    async listAutomations() {
      return [{ key: "safe-text", name: "Saugus tekstas", purpose: "Test" }];
    },
    async proposeAutomation(requestId, key, text) {
      proposed.push({ requestId, key, text });
      return { id: "run-1", state: "awaiting_confirmation" };
    },
    async proposeLesson() {
      return { id: "lesson-1", state: "proposed", occurrences: 1 };
    },
    async approvedLessons() {
      return ["Rašyk trumpai."];
    },
    audit: {
      async record(entry) {
        calls.push(entry);
      },
    },
  };
}

async function connect(deps: ToolHubDeps) {
  const handler = createToolHubHandler(deps);
  const client = new Client({ name: "test-agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL("http://tool-hub.test/api/mcp"),
    { fetch: (input, init) => handler.fetch(new Request(input, init)) },
  );
  await client.connect(transport);
  return client;
}
const text = (r: { content?: unknown }) =>
  ((r.content as { type: string; text: string }[])[0] ?? { text: "" }).text;

describe("Tool Hub MCP server", () => {
  it("lists the four tools with honest read-only annotations", async () => {
    const client = await connect(fakeDeps([], []));
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual([
      "knowledge_search",
      "list_automations",
      "list_lessons",
      "propose_lesson",
      "request_automation_run",
      "usage_stats",
    ]);
    expect(byName.knowledge_search.annotations?.readOnlyHint).toBe(true);
    expect(byName.usage_stats.annotations?.readOnlyHint).toBe(true);
    expect(byName.list_automations.annotations?.readOnlyHint).toBe(true);
    expect(byName.request_automation_run.annotations?.readOnlyHint).toBe(false);
    await client.close();
  });

  it("searches knowledge and records the call", async () => {
    const calls: ToolCallRecord[] = [];
    const client = await connect(fakeDeps(calls, []));
    const result = await client.callTool({
      name: "knowledge_search",
      arguments: { query: "renginys" },
    });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain("Reconnect Alumni");
    expect(calls).toEqual([
      expect.objectContaining({ tool: "knowledge_search", outcome: "ok" }),
    ]);
    await client.close();
  });

  it("only proposes automation runs for owner approval, never runs them", async () => {
    const calls: ToolCallRecord[] = [];
    const proposed: unknown[] = [];
    const client = await connect(fakeDeps(calls, proposed));
    const result = await client.callTool({
      name: "request_automation_run",
      arguments: { key: "safe-text", text: "Sintetinis tekstas" },
    });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain("awaiting_owner_approval");
    expect(proposed).toEqual([
      expect.objectContaining({ key: "safe-text", text: "Sintetinis tekstas" }),
    ]);
    expect(calls[0]).toMatchObject({
      tool: "request_automation_run",
      outcome: "ok",
      approvalRef: "run-1",
    });
    await client.close();
  });

  it("rejects invalid input without calling the dependency", async () => {
    const calls: ToolCallRecord[] = [];
    const proposed: unknown[] = [];
    const client = await connect(fakeDeps(calls, proposed));
    const result = await client.callTool({
      name: "request_automation_run",
      arguments: { key: "safe-text", text: "" },
    });
    expect(result.isError).toBe(true);
    expect(proposed).toHaveLength(0);
    await client.close();
  });

  it("reports dependency failures as tool errors and audits them", async () => {
    const calls: ToolCallRecord[] = [];
    const deps = fakeDeps(calls, []);
    deps.usageStats = async () => {
      throw new Error("database down");
    };
    const client = await connect(deps);
    const result = await client.callTool({
      name: "usage_stats",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(text(result)).not.toContain("database down");
    expect(calls[0]).toMatchObject({ tool: "usage_stats", outcome: "error" });
    await client.close();
  });
});

describe("tool call audit", () => {
  let db: Database;
  beforeEach(async () => {
    db = await openTestDatabase();
    await migrate(db, resolve("db/migrations"));
  });
  afterEach(async () => {
    await db.close();
  });
  it("persists calls through the 008 migration", async () => {
    await new DatabaseToolCallSink(db).record({
      tool: "request_automation_run",
      outcome: "ok",
      durationMs: 12,
      approvalRef: "run-1",
    });
    const rows = await db.query<{ tool: string; approval_ref: string }>(
      "SELECT tool, approval_ref FROM tool_calls",
    );
    expect(rows.rows).toEqual([
      { tool: "request_automation_run", approval_ref: "run-1" },
    ]);
  });
});
