import { randomUUID } from "node:crypto";
import { z } from "zod";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { IntegrationError } from "@/integrations/errors";
import type { UsageStatistics } from "../observability/stats";
import { logEvent } from "../observability/log";

export interface ToolCallRecord {
  tool: string;
  outcome: "ok" | "error";
  errorCode?: string;
  durationMs: number;
  approvalRef?: string;
}
export interface ToolCallSink {
  record(entry: ToolCallRecord): Promise<void>;
}
export interface KnowledgeHit {
  citation: string;
  title: string;
  heading: string | null;
  content: string;
}
export interface AutomationSummary {
  key: string;
  name: string;
  purpose: string;
}
/** Everything Tool Hub can touch; injected so tools stay testable. */
export interface ToolHubDeps {
  searchKnowledge(
    query: string,
    projectId: string | null,
  ): Promise<KnowledgeHit[]>;
  usageStats(days: number): Promise<UsageStatistics>;
  listAutomations(): Promise<AutomationSummary[]>;
  /** Creates a pending request; the owner confirms it in Control Center. */
  proposeAutomation(
    requestId: string,
    key: string,
    text: string,
  ): Promise<{ id: string; state: string }>;
  /** Agents may only propose; the owner approves in Control Center. */
  proposeLesson(
    text: string,
  ): Promise<{ id: string; state: string; occurrences: number }>;
  approvedLessons(): Promise<string[]>;
  audit: ToolCallSink;
}

const MAX_RESULT_CHARS = 12000;
type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function asText(value: unknown): ToolResult {
  const text = JSON.stringify(value, null, 2);
  return {
    content: [
      {
        type: "text",
        text:
          text.length > MAX_RESULT_CHARS
            ? `${text.slice(0, MAX_RESULT_CHARS)}\n…(truncated)`
            : text,
      },
    ],
  };
}

/** Runs one tool, audits it, and never leaks internal error details. */
async function run(
  deps: ToolHubDeps,
  tool: string,
  fn: () => Promise<{ result: unknown; approvalRef?: string }>,
): Promise<ToolResult> {
  const started = performance.now();
  const finish = async (
    record: Omit<ToolCallRecord, "tool" | "durationMs">,
  ) => {
    const entry: ToolCallRecord = {
      tool,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      ...record,
    };
    logEvent("toolhub.call", { ...entry });
    try {
      await deps.audit.record(entry);
    } catch {
      logEvent("toolhub.audit_failed", { tool });
    }
  };
  try {
    const { result, approvalRef } = await fn();
    await finish({ outcome: "ok", approvalRef });
    return asText(result);
  } catch (error) {
    const errorCode =
      error instanceof IntegrationError ? error.code : "unexpected";
    await finish({ outcome: "error", errorCode });
    return { ...asText({ error: errorCode }), isError: true };
  }
}

export function buildToolHubServer(deps: ToolHubDeps): McpServer {
  const server = new McpServer({
    name: "control-center-tool-hub",
    version: "1.0.0",
  });

  server.registerTool(
    "knowledge_search",
    {
      title: "Search owner knowledge",
      description:
        "Search the owner's private Markdown knowledge (projects, events, notes). Returns cited passages. Read-only.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(500),
        projectId: z.uuid().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, projectId }) =>
      run(deps, "knowledge_search", async () => ({
        result: await deps.searchKnowledge(query, projectId ?? null),
      })),
  );

  server.registerTool(
    "usage_stats",
    {
      title: "Model usage and cost",
      description:
        "Model requests, errors, tokens and cost (EUR, 1 nexos credit = 1 EUR) for the last N days. Read-only.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(90).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ days }) =>
      run(deps, "usage_stats", async () => ({
        result: await deps.usageStats(days ?? 30),
      })),
  );

  server.registerTool(
    "list_automations",
    {
      title: "List approved automations",
      description:
        "n8n automations the owner has approved for agent use, with their keys. Read-only.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      run(deps, "list_automations", async () => ({
        result: await deps.listAutomations(),
      })),
  );

  server.registerTool(
    "request_automation_run",
    {
      title: "Request an automation run",
      description:
        "Ask to run an approved n8n automation. This NEVER runs it: it creates a request the owner must approve in Control Center (Automations). Returns the request id and status.",
      inputSchema: z.object({
        key: z.string().trim().min(1).max(100),
        text: z.string().trim().min(1).max(240),
        requestId: z.uuid().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ key, text, requestId }) =>
      run(deps, "request_automation_run", async () => {
        const proposal = await deps.proposeAutomation(
          requestId ?? randomUUID(),
          key,
          text,
        );
        return {
          approvalRef: proposal.id,
          result: {
            status: "awaiting_owner_approval",
            requestId: proposal.id,
            state: proposal.state,
            review: "Control Center → Automatizacijos",
          },
        };
      }),
  );
  server.registerTool(
    "list_lessons",
    {
      title: "Owner-approved lessons",
      description:
        "Rules the owner approved from past mistakes and feedback. Follow them. Read-only.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      run(deps, "list_lessons", async () => ({
        result: await deps.approvedLessons(),
      })),
  );

  server.registerTool(
    "propose_lesson",
    {
      title: "Propose a lesson",
      description:
        "Propose a short reusable rule learned from a mistake, for example: Check the CRM sheet before suggesting a partner. It is NOT applied until the owner approves it in Control Center. Repeats are counted.",
      inputSchema: z.object({ text: z.string().trim().min(3).max(400) }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ text }) =>
      run(deps, "propose_lesson", async () => {
        const lesson = await deps.proposeLesson(text);
        return {
          approvalRef: lesson.id,
          result: { status: "awaiting_owner_approval", ...lesson },
        };
      }),
  );
  return server;
}

/** Stateless web-standard handler: one fresh server per HTTP request. */
export function createToolHubHandler(deps: ToolHubDeps) {
  return createMcpHandler(() => buildToolHubServer(deps), {
    legacy: "stateless",
    responseMode: "json",
  });
}
