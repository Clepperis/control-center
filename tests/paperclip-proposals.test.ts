import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openTestDatabase } from "./pglite";
import { migrate } from "../src/server/db/migrate";
import { Store, marker } from "../src/server/orchestration/store";
import { OrchestrationService } from "../src/server/orchestration/service";
import type { Database } from "../src/server/db/types";
import type { PlanningGateway } from "../src/integrations/nexos";
import {
  PaperclipClient,
  type DelegationAdapter,
} from "../src/integrations/paperclip";
import type { ExternalTask } from "../src/integrations/contracts";
import type { Agent } from "../src/domain/models";
import {
  planSchema,
  replySchema,
  type Plan,
} from "../src/domain/orchestration";
import { IntegrationError } from "../src/integrations/errors";
import { PaperclipStatus } from "../src/components/paperclip-status";

const companyId = "11111111-1111-4111-8111-111111111111";
const agentId = "22222222-2222-4222-8222-222222222222";
const agent: Agent = {
  id: agentId,
  name: "Sintetinis agentas",
  role: "general",
  status: "idle",
  eligible: true,
};
const plan: Plan & Required<Pick<Plan, "budgetCeiling">> = {
  objective: "Patikrinti sintetinį sakinį",
  title: "Vieno sakinio peržiūra",
  boundedTask: "Perskaityti tik pateiktą sintetinį sakinį.",
  agentId: null,
  completionCriteria: ["Vienas pasiūlymas su paaiškinimu"],
  constraints: ["Jokių išorinių veiksmų"],
  budgetCeiling: { amount: 5, currency: "EUR" },
};
const pcConfig = {
  baseUrl: "https://paperclip.example",
  apiKey: "pcp_board_synthetic",
  companyId,
  agentIds: [agentId],
  enabled: true,
  contractVerified: true,
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const issue = {
  id: randomUUID(),
  companyId,
  identifier: "SYN-7",
  status: "todo",
  title: "Vieno sakinio peržiūra",
  description: "x",
  assigneeAgentId: null,
};

describe("task proposal schema", () => {
  it("accepts a typed proposal with budget ceiling and optional target agent", () => {
    expect(planSchema.safeParse(plan).success).toBe(true);
    expect(
      replySchema.safeParse({ kind: "plan", reply: "Siūlau.", plan }).success,
    ).toBe(true);
  });
  it("requires a budget ceiling on every model-proposed plan", () => {
    const { budgetCeiling: _omit, ...without } = plan;
    void _omit;
    expect(
      replySchema.safeParse({ kind: "plan", reply: "Siūlau.", plan: without })
        .success,
    ).toBe(false);
    // Plans stored before this slice stay readable.
    expect(planSchema.safeParse(without).success).toBe(true);
  });
  it.each([
    ["zero", { amount: 0, currency: "EUR" }],
    ["negative", { amount: -1, currency: "EUR" }],
    ["oversized", { amount: 10001, currency: "EUR" }],
    ["fractional cents", { amount: 1.234, currency: "EUR" }],
    ["not finite", { amount: Infinity, currency: "EUR" }],
    ["other currency", { amount: 5, currency: "USD" }],
    ["string amount", { amount: "5", currency: "EUR" }],
  ])("rejects a %s budget ceiling", (_n, budgetCeiling) => {
    expect(planSchema.safeParse({ ...plan, budgetCeiling }).success).toBe(
      false,
    );
  });
  it("rejects oversized or empty goal, criteria and unknown fields", () => {
    expect(
      planSchema.safeParse({ ...plan, objective: "x".repeat(1001) }).success,
    ).toBe(false);
    expect(
      planSchema.safeParse({ ...plan, completionCriteria: [] }).success,
    ).toBe(false);
    expect(
      planSchema.safeParse({
        ...plan,
        completionCriteria: Array(7).fill("x"),
      }).success,
    ).toBe(false);
    expect(
      planSchema.safeParse({ ...plan, assignees: [agentId] }).success,
    ).toBe(false);
  });
});

describe("Paperclip adapter payload", () => {
  it("creates one unassigned issue carrying goal, criteria and budget ceiling", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json(issue));
    await new PaperclipClient(pcConfig, f).createTask({
      title: "T",
      description: "Tikslas\n\nBiudžeto riba: 5 EUR",
    });
    expect(f).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(f.mock.calls[0][1]?.body));
    expect(body).toEqual({
      title: "T",
      description: "Tikslas\n\nBiudžeto riba: 5 EUR",
      status: "todo",
    });
    expect(body).not.toHaveProperty("assigneeAgentId");
  });
  it("assigns only the one chosen target agent and still rejects disallowed agents", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json(issue));
    const client = new PaperclipClient(pcConfig, f);
    await client.createTask({ title: "T", description: "D", agentId });
    expect(JSON.parse(String(f.mock.calls[0][1]?.body)).assigneeAgentId).toBe(
      agentId,
    );
    await expect(
      client.createTask({
        title: "T",
        description: "D",
        agentId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "agent_unavailable" });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("reads approval requests with the task and marks them unavailable on failure", async () => {
    const ok = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/comments")) return json([{ body: "ok" }]);
      if (u.endsWith("/approvals"))
        return json([
          { id: randomUUID(), type: "budget_override", status: "pending" },
        ]);
      return json(issue);
    });
    const task = await new PaperclipClient(pcConfig, ok).readTask(issue.id);
    expect(task.approvals).toEqual([
      expect.objectContaining({ type: "budget_override", status: "pending" }),
    ]);
    const bad = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/comments")) return json([]);
      if (u.endsWith("/approvals")) return json({ nope: true });
      return json(issue);
    });
    expect(
      (await new PaperclipClient(pcConfig, bad).readTask(issue.id)).approvals,
    ).toBeNull();
    const down = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/comments")) return json([]);
      if (u.endsWith("/approvals")) return json({}, 500);
      return json(issue);
    });
    expect(
      (await new PaperclipClient(pcConfig, down).readTask(issue.id)).approvals,
    ).toBeNull();
  });
});

describe("task proposal confirmation flow", () => {
  let db: Database;
  let store: Store;
  let service: OrchestrationService;
  let gateway: PlanningGateway;
  let tasks: ExternalTask[];
  let created: { title: string; description: string; agentId?: string }[];
  let failWith: IntegrationError | null;
  let approvals: ExternalTask["approvals"];
  let paperclip: DelegationAdapter;
  beforeEach(async () => {
    db = await openTestDatabase();
    await migrate(db, resolve("db/migrations"));
    store = new Store(db);
    tasks = [];
    created = [];
    failWith = null;
    approvals = [];
    gateway = {
      async complete() {
        return {
          reply: { kind: "plan", reply: "Siūlau užduotį.", plan },
          usage: null,
        };
      },
    };
    paperclip = {
      async listAgents() {
        return [agent];
      },
      async createTask(t) {
        created.push(t);
        if (failWith) throw failWith;
        const task: ExternalTask = {
          id: randomUUID(),
          companyId,
          identifier: "SYN-7",
          status: "todo",
          title: t.title,
          description: t.description,
          comments: [],
          assigneeAgentId: null,
        };
        tasks.push(task);
        return { id: task.id };
      },
      async readTask(id) {
        const t = tasks.find((x) => x.id === id);
        if (!t) throw new IntegrationError("provider");
        return { ...t, approvals };
      },
      async findByMarker(value) {
        return tasks.filter((t) => t.description?.includes(value));
      },
      taskUrl: (id) => `https://paperclip.example/SYN/issues/${id}`,
    };
    service = new OrchestrationService(store, gateway, paperclip, true);
  });
  afterEach(async () => {
    await db.close();
  });
  const propose = async () =>
    (await service.submit("owner", randomUUID(), randomUUID(), "Padaryk."))
      .runs[0];

  it("proposes an unassigned task for confirmation and submits nothing", async () => {
    const run = await propose();
    expect(run.state).toBe("awaiting_confirmation");
    expect(run.plan.budgetCeiling).toEqual({ amount: 5, currency: "EUR" });
    expect(created).toHaveLength(0);
  });
  it("on confirmation sends goal, criteria and budget ceiling without assigning an agent", async () => {
    const run = await propose();
    const done = await service.confirm("owner", run.id, run.planHash);
    expect(done.state).toBe("delegated");
    expect(created).toHaveLength(1);
    expect(created[0].agentId).toBeUndefined();
    expect(created[0].description).toContain(plan.objective);
    expect(created[0].description).toContain(plan.completionCriteria[0]);
    expect(created[0].description).toContain("Biudžeto riba: 5 EUR");
    await service.confirm("owner", run.id, run.planHash);
    expect(created).toHaveLength(1);
  });
  it("still requires the exact plan hash, including the budget ceiling", async () => {
    const run = await propose();
    await expect(
      service.confirm("owner", run.id, "0".repeat(64)),
    ).rejects.toMatchObject({ code: "plan_changed" });
    expect(created).toHaveLength(0);
  });
  it("sends the chosen target agent when one is proposed", async () => {
    gateway.complete = async () => ({
      reply: { kind: "plan", reply: "Siūlau.", plan: { ...plan, agentId } },
      usage: null,
    });
    const run = await propose();
    await service.confirm("owner", run.id, run.planHash);
    expect(created[0].agentId).toBe(agentId);
  });
  it("keeps one attempt: a definite failure is not retried", async () => {
    failWith = new IntegrationError("provider");
    const run = await propose();
    const failed = await service.confirm("owner", run.id, run.planHash);
    expect(failed.state).toBe("failed");
    await service.confirm("owner", run.id, run.planHash).catch(() => {});
    expect(created).toHaveLength(1);
  });
  it("treats an uncertain outcome as blocked and reconciles by marker without a second POST", async () => {
    failWith = new IntegrationError("timeout", true);
    const run = await propose();
    const blocked = await service.confirm("owner", run.id, run.planHash);
    expect(blocked).toMatchObject({
      state: "blocked",
      errorCode: "creation_uncertain",
    });
    // The POST actually succeeded on the Paperclip side.
    tasks.push({
      id: randomUUID(),
      companyId,
      identifier: "SYN-8",
      status: "todo",
      title: plan.title,
      description: marker(run.id),
      comments: [],
      assigneeAgentId: null,
    });
    const found = await service.refresh("owner", run.id);
    expect(found.externalTaskId).toBe(tasks[0].id);
    expect(created).toHaveLength(1);
  });
  it("stores Paperclip approvals with the synced result and keeps them unavailable when null", async () => {
    approvals = [
      { id: randomUUID(), type: "budget_override", status: "pending" },
    ];
    const run = await propose();
    const done = await service.confirm("owner", run.id, run.planHash);
    expect(done.result?.approvals).toEqual([
      expect.objectContaining({ status: "pending" }),
    ]);
    approvals = null;
    const next = await service.refresh("owner", run.id);
    expect(next.result?.approvals).toBeNull();
  });
});

describe("task status rendering", () => {
  const base = {
    identifier: "SYN-7",
    status: "in_review",
    taskUrl: "https://paperclip.example/SYN/issues/SYN-7",
    budgetCeiling: { amount: 5, currency: "EUR" as const },
    comments: ["Pirmas komentaras"],
  };
  it("shows status, comments, approvals, requested budget and the native link", () => {
    const html = renderToStaticMarkup(
      createElement(PaperclipStatus, {
        ...base,
        approvals: [
          { id: randomUUID(), type: "budget_override", status: "pending" },
        ],
      }),
    );
    expect(html).toContain("in_review");
    expect(html).toContain("Pirmas komentaras");
    expect(html).toContain("budget_override");
    expect(html).toContain("5 EUR");
    expect(html).toContain('href="https://paperclip.example/SYN/issues/SYN-7"');
  });
  it("shows explicit notices, never zeros, when data is unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(PaperclipStatus, {
        ...base,
        taskUrl: null,
        comments: undefined,
        approvals: null,
        budgetCeiling: undefined,
      }),
    );
    expect(html).toContain("Patvirtinimų duomenų gauti nepavyko");
    expect(html).toContain("Biudžeto riba nenustatyta");
    expect(html).toContain("Paperclip biudžeto sunaudojimo duomenų nėra");
    expect(html).not.toMatch(/\b0 EUR\b/);
    expect(html).not.toContain("<a ");
  });
  it("shows an explicit empty state for no approvals", () => {
    const html = renderToStaticMarkup(
      createElement(PaperclipStatus, { ...base, approvals: [] }),
    );
    expect(html).toContain("Patvirtinimų nėra");
  });
});
