import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { resolve, dirname, basename } from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { openTestDatabase } from "./pglite";
import { migrate } from "../src/server/db/migrate";
import { Store, marker, digest } from "../src/server/orchestration/store";
import { OrchestrationService } from "../src/server/orchestration/service";
import type { Database } from "../src/server/db/types";
import type { PlanningGateway } from "../src/integrations/nexos";
import type { DelegationAdapter } from "../src/integrations/paperclip";
import type { ExternalTask } from "../src/integrations/contracts";
import type { Agent } from "../src/domain/models";
import {
  assertTransition,
  mapPaperclipStatus,
  isStale,
  type Plan,
} from "../src/domain/orchestration";
import { IntegrationError } from "../src/integrations/errors";

const companyId = "11111111-1111-4111-8111-111111111111";
const agentId = "22222222-2222-4222-8222-222222222222";
const agent: Agent = {
  id: agentId,
  name: "Sintetinis tikrintojas",
  role: "reviewer",
  status: "idle",
  eligible: true,
};
const plan: Plan = {
  objective: "Patikrinti sintetinį sakinį",
  title: "Vieno sakinio peržiūra",
  boundedTask:
    "Perskaityti tik pateiktą sintetinį sakinį ir pasiūlyti vieną pataisą.",
  agentId,
  completionCriteria: ["Vienas pasiūlymas su paaiškinimu"],
  constraints: ["Jokių išorinių veiksmų"],
};
let db: Database;
let store: Store;
let service: OrchestrationService;
let gateway: PlanningGateway;
let paperclip: DelegationAdapter;
let tasks: ExternalTask[];
let eligible: Agent[];
let createCalls: number;
let modelCalls: number;
beforeEach(async () => {
  db = await openTestDatabase();
  await migrate(db, resolve("db/migrations"));
  store = new Store(db);
  tasks = [];
  eligible = [agent];
  createCalls = 0;
  modelCalls = 0;
  gateway = {
    async complete() {
      modelCalls++;
      return {
        reply: { kind: "plan", reply: "Siūlau vieną ribotą užduotį.", plan },
        usage: { inputTokens: 23, outputTokens: 37, totalTokens: 60 },
      };
    },
  };
  paperclip = {
    async listAgents() {
      return eligible;
    },
    async createTask(t) {
      createCalls++;
      const task = {
        id: randomUUID(),
        companyId,
        identifier: "TEST-1",
        status: "todo",
        title: t.title,
        description: t.description,
        comments: [],
        assigneeAgentId: agentId,
      };
      tasks.push(task);
      return { id: task.id };
    },
    async readTask(id) {
      const task = tasks.find((t) => t.id === id);
      if (!task) throw new IntegrationError("provider");
      return task;
    },
    async findByMarker(value) {
      return tasks.filter((t) => t.description?.includes(value));
    },
    taskUrl(id) {
      return `https://paperclip.example/issues/${id}`;
    },
  };
  service = new OrchestrationService(store, gateway, paperclip, true);
});
afterEach(async () => {
  await db.close();
});
async function proposed() {
  const conversationId = randomUUID();
  const requestId = randomUUID();
  const snapshot = await service.submit(
    "owner",
    conversationId,
    requestId,
    "Peržiūrėti tik sintetinį sakinį.",
  );
  return { conversationId, requestId, snapshot, run: snapshot.runs[0] };
}
describe("durable owner orchestration", () => {
  it("keeps pre-Phase-4 unscoped request hashes compatible", async () => {
    const conversationId = randomUUID(),
      requestId = randomUUID(),
      text = "Legacy synthetic request";
    const first = await store.beginTurn(
      "owner",
      conversationId,
      requestId,
      text,
    );
    await db.query("UPDATE turns SET input_hash=$2 WHERE id=$1", [
      first.id,
      digest(`${conversationId}\n${text}`),
    ]);
    expect(
      await store.beginTurn("owner", conversationId, requestId, text),
    ).toEqual({ created: false, id: first.id });
  });
  it("persists conversations, separates proposal from execution and rejects duplicate/mismatched submissions", async () => {
    const { conversationId, requestId, snapshot } = await proposed();
    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.runs[0].state).toBe("awaiting_confirmation");
    expect(createCalls).toBe(0);
    await service.submit(
      "owner",
      conversationId,
      requestId,
      "Peržiūrėti tik sintetinį sakinį.",
    );
    expect(modelCalls).toBe(1);
    await expect(
      service.submit("owner", conversationId, requestId, "Kitas tekstas"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      store.snapshot("other-owner", conversationId),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await store.snapshot("owner", conversationId)).messages[1].usage
        ?.totalTokens,
    ).toBe(60);
  });
  it("requires exact reviewed approval and atomically handles repeated simultaneous confirmations", async () => {
    const { run } = await proposed();
    await expect(
      service.confirm("owner", run.id, "wrong"),
    ).rejects.toMatchObject({ code: "plan_changed" });
    await expect(
      service.confirm("other-owner", run.id, run.planHash),
    ).rejects.toMatchObject({ status: 404 });
    await Promise.all([
      service.confirm("owner", run.id, run.planHash),
      service.confirm("owner", run.id, run.planHash),
    ]);
    expect(createCalls).toBe(1);
    expect((await store.ownedRun("owner", run.id)).state).toBe("delegated");
    expect(tasks[0].description).toContain(marker(run.id));
  });
  it("respects disabled execution and paused agents without changing their settings", async () => {
    const { run } = await proposed();
    const disabled = new OrchestrationService(store, gateway, paperclip, false);
    await expect(
      disabled.confirm("owner", run.id, run.planHash),
    ).rejects.toMatchObject({ code: "disabled" });
    eligible = [{ ...agent, status: "paused", eligible: false }];
    await expect(
      service.confirm("owner", run.id, run.planHash),
    ).rejects.toMatchObject({ code: "agent_unavailable" });
    expect(createCalls).toBe(0);
    expect((await store.ownedRun("owner", run.id)).confirmedAt).toBeNull();
  });
  it("blocks an unassigned proposal rather than fabricating an executable agent", async () => {
    eligible = [];
    gateway.complete = async () => ({
      reply: {
        kind: "plan",
        reply: "Reikia parengti agentą.",
        plan: { ...plan, agentId: null },
      },
      usage: null,
    });
    const { run } = await proposed();
    expect(run.state).toBe("blocked");
    expect(run.errorCode).toBe("agent_unavailable");
    expect(createCalls).toBe(0);
  });
  it("reconciles an ambiguous successful POST after restart without ever issuing another POST", async () => {
    const original = paperclip.createTask.bind(paperclip);
    paperclip.createTask = async (t) => {
      await original(t);
      throw new IntegrationError("timeout", true);
    };
    const { run } = await proposed();
    const uncertain = await service.confirm("owner", run.id, run.planHash);
    expect(uncertain.errorCode).toBe("creation_uncertain");
    expect(uncertain.externalTaskId).toBeNull();
    await service.confirm("owner", run.id, run.planHash);
    expect(createCalls).toBe(1);
    tasks[0].status = "done";
    tasks[0].comments = ["Sintetinė peržiūra: pasiūlyta viena pataisa."];
    const restarted = new OrchestrationService(
      new Store(db),
      gateway,
      paperclip,
      true,
    );
    await restarted.tick();
    const recovered = await store.ownedRun("owner", run.id);
    expect(recovered.state).toBe("completed");
    expect(recovered.result?.comments).toHaveLength(1);
    expect(recovered.syncedAt).not.toBeNull();
    expect(createCalls).toBe(1);
  });
  it("keeps a missing or multiply-matched creation uncertain and never retries writes", async () => {
    paperclip.createTask = async () => {
      createCalls++;
      throw new IntegrationError("provider", true);
    };
    const { run } = await proposed();
    await service.confirm("owner", run.id, run.planHash);
    await service.tick();
    expect((await store.ownedRun("owner", run.id)).errorCode).toBe(
      "creation_uncertain",
    );
    expect(createCalls).toBe(1);
    const duplicate = {
      id: randomUUID(),
      companyId,
      identifier: "TEST-2",
      status: "todo",
      title: plan.title,
      description: marker(run.id),
      comments: [],
      assigneeAgentId: agentId,
    };
    tasks = [duplicate, { ...duplicate, id: randomUUID() }];
    await service.tick();
    expect((await store.ownedRun("owner", run.id)).errorCode).toBe(
      "multiple_matches",
    );
    expect(createCalls).toBe(1);
  });
  it("recovers expired model requests and crashed delegation attempts without starting work", async () => {
    const conversationId = randomUUID();
    const started = await store.beginTurn(
      "owner",
      conversationId,
      randomUUID(),
      "Sintetinė žinutė",
    );
    await db.query(
      "UPDATE turns SET created_at=now()-interval '4 minutes' WHERE id=$1",
      [started.id],
    );
    const { run } = await proposed();
    await db.query(
      "UPDATE orchestration_runs SET state='delegating',confirmed_at=now(),confirmed_by='owner',delegation_started_at=now()-interval '4 minutes' WHERE id=$1",
      [run.id],
    );
    const restarted = new OrchestrationService(
      new Store(db),
      gateway,
      paperclip,
      true,
    );
    await restarted.tick();
    expect(
      (await store.snapshot("owner", conversationId)).turns[0],
    ).toMatchObject({ status: "failed", errorCode: "interrupted" });
    expect((await store.ownedRun("owner", run.id)).errorCode).toBe(
      "creation_uncertain",
    );
    expect(createCalls).toBe(0);
  });
  it("rejects a second pending turn and preserves the original user message", async () => {
    const conversationId = randomUUID();
    await store.beginTurn(
      "owner",
      conversationId,
      randomUUID(),
      "Pirma žinutė",
    );
    await expect(
      store.beginTurn("owner", conversationId, randomUUID(), "Antra žinutė"),
    ).rejects.toMatchObject({ code: "turn_pending" });
    expect(
      (await store.snapshot("owner", conversationId)).messages,
    ).toHaveLength(1);
  });
  it("releases a conversation from an interrupted turn without a worker and never repeats the model request", async () => {
    const conversationId = randomUUID();
    const interrupted = await store.beginTurn(
      "owner",
      conversationId,
      randomUUID(),
      "Pirma žinutė",
    );
    await db.query(
      "UPDATE turns SET created_at=now()-interval '4 minutes' WHERE id=$1",
      [interrupted.id],
    );
    const next = await store.beginTurn(
      "owner",
      conversationId,
      randomUUID(),
      "Antra žinutė",
    );
    expect(next.created).toBe(true);
    const snapshot = await store.snapshot("owner", conversationId);
    expect(snapshot.turns.find((t) => t.id === interrupted.id)).toMatchObject({
      status: "failed",
      errorCode: "interrupted",
    });
    expect(snapshot.messages.map((m) => m.content)).toEqual([
      "Pirma žinutė",
      "Antra žinutė",
    ]);
  });
  it.each([
    "authentication",
    "rate_limit",
    "provider",
    "malformed",
    "timeout",
    "cancelled",
    "configuration",
    "disabled",
  ] as const)(
    "persists %s provider failures with no invented usage or task",
    async (code) => {
      gateway.complete = async () => {
        throw new IntegrationError(code);
      };
      const { snapshot } = await proposed();
      expect(snapshot.turns[0]).toMatchObject({
        status: "failed",
        errorCode: code,
      });
      expect(snapshot.messages).toHaveLength(1);
      expect(snapshot.runs).toHaveLength(0);
      expect(createCalls).toBe(0);
    },
  );
  it("tracks actual external status, stale errors and local-only cancellation", async () => {
    const { run } = await proposed();
    await service.confirm("owner", run.id, run.planHash);
    tasks[0].status = "in_progress";
    await service.refresh("owner", run.id);
    expect((await store.ownedRun("owner", run.id)).state).toBe("running");
    paperclip.readTask = async () => {
      throw new IntegrationError("provider");
    };
    await service.refresh("owner", run.id);
    const stale = await store.ownedRun("owner", run.id);
    expect(stale.state).toBe("running");
    expect(stale.errorCode).toBe("sync_error");
    expect(stale.syncedAt).not.toBeNull();
    await service.stopTracking("owner", run.id);
    expect((await store.ownedRun("owner", run.id)).tracking).toBe(false);
    expect(tasks[0].status).toBe("in_progress");
  });
});
it("uses conservative external mappings and explicit freshness", () => {
  expect(
    [
      "backlog",
      "todo",
      "in_progress",
      "in_review",
      "done",
      "blocked",
      "cancelled",
      "unexpected",
    ].map(mapPaperclipStatus),
  ).toEqual([
    "delegated",
    "delegated",
    "running",
    "review",
    "completed",
    "blocked",
    "cancelled",
    "blocked",
  ]);
  expect(isStale(null)).toBe(true);
  expect(isStale(new Date(1000).toISOString(), 92000)).toBe(true);
  expect(isStale(new Date(1000).toISOString(), 2000)).toBe(false);
  expect(() =>
    assertTransition("awaiting_confirmation", "completed"),
  ).toThrow();
  expect(() => assertTransition("completed", "running")).toThrow();
});
it("retains PostgreSQL records across an actual database close and reopen, and migrations are repeatable", async () => {
  const base = resolve(".local");
  await mkdir(base, { recursive: true });
  const path = await mkdtemp(`${base}/pg-test-`);
  let persistent = await openTestDatabase(path);
  try {
    await migrate(persistent, resolve("db/migrations"));
    const id = randomUUID();
    const before = new OrchestrationService(
      new Store(persistent),
      gateway,
      paperclip,
      true,
    );
    const proposed = await before.submit(
      "owner",
      id,
      randomUUID(),
      "Patvarumo bandymas",
    );
    const run = await before.confirm(
      "owner",
      proposed.runs[0].id,
      proposed.runs[0].planHash,
    );
    await persistent.close();
    persistent = await openTestDatabase(path);
    await migrate(persistent, resolve("db/migrations"));
    const after = new OrchestrationService(
      new Store(persistent),
      gateway,
      paperclip,
      true,
    );
    const saved = await after.store.snapshot("owner", id);
    expect(saved.messages[0].content).toBe("Patvarumo bandymas");
    expect(saved.runs[0]).toMatchObject({
      state: "delegated",
      externalTaskId: run.externalTaskId,
      confirmedAt: run.confirmedAt,
      planHash: run.planHash,
    });
    await after.confirm("owner", run.id, run.planHash);
    expect(createCalls).toBe(1);
  } finally {
    await persistent.close();
    if (dirname(path) !== base || !basename(path).startsWith("pg-test-"))
      throw new Error("Unsafe test cleanup path");
    await rm(path, { recursive: true, force: true });
  }
});
