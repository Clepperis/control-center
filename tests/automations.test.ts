import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { openTestDatabase } from "./pglite";
import { migrate } from "../src/server/db/migrate";
import { Store, digest } from "../src/server/orchestration/store";
import {
  AutomationService,
  type AutomationSettings,
} from "../src/server/automations/service";
import { OrchestrationService } from "../src/server/orchestration/service";
import { IntegrationError } from "../src/integrations/errors";
import type {
  AutomationAdapter,
  AutomationExecution,
} from "../src/integrations/contracts";
import type { Database } from "../src/server/db/types";
import { contract, config } from "./automation-fixtures";
import { configuredAutomations } from "../src/server/automations/configured";

let db: Database,
  store: Store,
  service: AutomationService,
  adapter: AutomationAdapter;
let records: AutomationExecution[],
  creates: number,
  createError: IntegrationError | null,
  readError: boolean,
  contractValid: boolean;
const owner = "synthetic-owner";
const settings: AutomationSettings = {
  configured: true,
  enabled: true,
  contract,
  configHash: "test-config",
  originHash: digest(config.origin),
};
beforeEach(async () => {
  db = await openTestDatabase();
  await migrate(db, resolve("db/migrations"));
  store = new Store(db);
  records = [];
  creates = 0;
  createError = null;
  readError = false;
  contractValid = true;
  adapter = {
    async listWorkflows() {
      if (readError) throw new IntegrationError("authentication");
      return {
        workflows: [
          {
            id: contract.workflowId,
            name: contract.name,
            description: null,
            active: false,
            availableInMCP: true,
            eligible: false,
            reason: "not_eligible",
            versionId: null,
            workflowUrl: "https://n8n.example/workflow/synthetic-workflow",
          },
          {
            id: "business",
            name: "Unapproved example",
            description: null,
            active: true,
            availableInMCP: true,
            eligible: false,
            reason: "not_eligible",
            versionId: null,
            workflowUrl: "https://n8n.example/workflow/business",
          },
        ],
        truncated: false,
      };
    },
    async verifyContract() {
      if (!contractValid) throw new IntegrationError("malformed");
    },
    async execute(c, requestId, text) {
      creates++;
      records.push({
        id: String(creates),
        workflowId: c.workflowId,
        status: "running",
        mode: "manual",
        startedAt: new Date().toISOString(),
        stoppedAt: null,
        waitTill: null,
        correlation: { requestId, text },
        result: { requestId, transformedText: text.toUpperCase() },
      });
      if (createError) throw createError;
      return { id: String(creates), rejected: false };
    },
    async readExecution(_w, id) {
      if (readError) throw new IntegrationError("provider");
      const e = records.find((r) => r.id === id);
      if (!e) throw new IntegrationError("provider");
      return e;
    },
    async findExecutions() {
      return { ids: records.map((r) => r.id), complete: true };
    },
    workflowUrl(id) {
      return `https://n8n.example/workflow/${id}`;
    },
    executionUrl(w, id) {
      return `https://n8n.example/workflow/${w}/executions/${id}`;
    },
  };
  service = new AutomationService(store, adapter, settings);
});
afterEach(async () => {
  await db.close();
});
const propose = () =>
  service.propose(owner, randomUUID(), contract.key, { text: "labas" });
describe("durable n8n requests with test-only external substitutes", () => {
  it("reports missing and invalid application configuration without inheriting a verified catalog", async () => {
    await service.syncCatalog(owner);
    const missing = await configuredAutomations(store, {}).catalog(owner);
    expect(missing).toMatchObject({
      state: "not_configured",
      workflows: [],
      executionEnabled: false,
      errorCode: "not_configured",
    });
    const invalid = await configuredAutomations(store, {
      N8N_ORIGIN: "http://invalid.example",
      N8N_MCP_TOKEN: "synthetic-application-token",
    }).catalog(owner);
    expect(invalid).toMatchObject({
      state: "unavailable",
      workflows: [],
      executionEnabled: false,
      errorCode: "configuration",
    });
    expect(creates).toBe(0);
  });
  it("separates configured/verified/stale/unauthorized and never grants discovery-wide execution", async () => {
    expect((await service.catalog(owner)).state).toBe("configured");
    const c = await service.syncCatalog(owner);
    expect(c.state).toBe("connected");
    expect(c.workflows.map((w) => w.eligible)).toEqual([true, false]);
    await db.query(
      "UPDATE automation_catalog SET synced_at=now()-interval '2 minutes'",
    );
    expect((await service.catalog(owner)).state).toBe("stale");
    readError = true;
    expect((await service.syncCatalog(owner)).state).toBe("unauthorized");
    const other = new AutomationService(store, adapter, {
      ...settings,
      configHash: "rotated-key",
    });
    const failed = await other.syncCatalog(owner);
    expect(failed.state).toBe("unauthorized");
    expect(failed.workflows).toEqual([]);
    await expect(
      service.propose(owner, randomUUID(), "business", { text: "x" }),
    ).rejects.toMatchObject({ code: "not_eligible" });
    expect(creates).toBe(0);
  });
  it("binds exact input/contract, rejects extra fields, and idempotently persists a local request", async () => {
    const id = randomUUID();
    const run = await service.propose(owner, id, contract.key, {
      text: " labas ",
    });
    expect(run.input).toEqual({ text: "labas" });
    expect(run.state).toBe("awaiting_confirmation");
    const separate = await service.propose(owner, randomUUID(), contract.key, {
      text: "labas",
    });
    expect(separate.actionHash).not.toBe(run.actionHash);
    await expect(
      service.confirm(owner, separate.id, run.actionHash),
    ).rejects.toMatchObject({ code: "plan_changed" });
    expect(creates).toBe(0);
    expect(
      (await service.propose(owner, id, contract.key, { text: "labas" })).id,
    ).toBe(run.id);
    await expect(
      service.propose(owner, id, contract.key, { text: "edited" }),
    ).rejects.toMatchObject({ code: "request_conflict" });
    await expect(
      service.propose(owner, randomUUID(), contract.key, {
        text: "x",
        credential: "forbidden",
      }),
    ).rejects.toThrow();
    await expect(
      service.confirm(owner, run.id, "0".repeat(64)),
    ).rejects.toMatchObject({ code: "plan_changed" });
    expect(creates).toBe(0);
  });
  it("atomically claims simultaneous confirmations and never resubmits repeated confirmations", async () => {
    const r = await propose();
    await Promise.all([
      service.confirm(owner, r.id, r.actionHash),
      service.confirm(owner, r.id, r.actionHash),
    ]);
    expect(creates).toBe(1);
    expect((await service.get(owner, r.id)).state).toBe("accepted");
    await service.confirm(owner, r.id, r.actionHash);
    expect(creates).toBe(1);
    records[0].status = "success";
    records[0].stoppedAt = new Date().toISOString();
    const done = await service.refresh(owner, r.id);
    expect(done).toMatchObject({
      state: "succeeded",
      result: { transformedText: "LABAS" },
      externalId: "1",
    });
  });
  it("rejects expired confirmations, changed definitions and disabled execution before claiming", async () => {
    const r = await propose();
    contractValid = false;
    await expect(
      service.confirm(owner, r.id, r.actionHash),
    ).rejects.toMatchObject({ code: "contract_changed" });
    contractValid = true;
    await expect(
      new AutomationService(store, adapter, {
        ...settings,
        enabled: false,
      }).confirm(owner, r.id, r.actionHash),
    ).rejects.toMatchObject({ code: "disabled" });
    await db.query(
      "UPDATE automation_requests SET expires_at=now()-interval '1 second'",
    );
    await expect(
      service.confirm(owner, r.id, r.actionHash),
    ).rejects.toMatchObject({ code: "confirmation_expired" });
    expect((await service.get(owner, r.id)).confirmedAt).toBeNull();
    expect(creates).toBe(0);
  });
  it("reconciles timeout-after-accept using the preserved correlation without another submission", async () => {
    const r = await propose();
    createError = new IntegrationError("timeout", true);
    const unknown = await service.confirm(owner, r.id, r.actionHash);
    expect(unknown).toMatchObject({
      state: "unknown",
      errorCode: "submission_unknown",
      externalId: null,
    });
    await service.confirm(owner, r.id, r.actionHash);
    expect(creates).toBe(1);
    expect(await service.refresh(owner, r.id)).toMatchObject({
      state: "running",
      externalId: "1",
    });
    expect(creates).toBe(1);
  });
  it.each([0, 2])(
    "keeps %s correlation matches unresolved and does not retry",
    async (count) => {
      const r = await propose();
      createError = new IntegrationError("provider", true);
      await service.confirm(owner, r.id, r.actionHash);
      records = count === 0 ? [] : [records[0], { ...records[0], id: "2" }];
      await service.refresh(owner, r.id);
      await service.tick();
      expect((await service.get(owner, r.id)).state).toBe("unknown");
      expect(creates).toBe(1);
    },
  );
  it("does not link partial searches, mismatching text, another origin or data hidden by retention", async () => {
    const r = await propose();
    createError = new IntegrationError("timeout", true);
    await service.confirm(owner, r.id, r.actionHash);
    adapter.findExecutions = async () => ({ ids: ["1"], complete: false });
    await service.refresh(owner, r.id);
    expect((await service.get(owner, r.id)).externalId).toBeNull();
    adapter.findExecutions = async () => ({ ids: ["1"], complete: true });
    records[0].correlation!.text = "other";
    await service.refresh(owner, r.id);
    expect((await service.get(owner, r.id)).externalId).toBeNull();
    const changed = new AutomationService(store, adapter, {
      ...settings,
      originHash: "different",
    });
    expect((await changed.get(owner, r.id)).workflowUrl).toBeNull();
    const fresh = await propose();
    await expect(
      changed.confirm(owner, fresh.id, fresh.actionHash),
    ).rejects.toMatchObject({ code: "origin_changed" });
    expect(creates).toBe(1);
  });
  it.each(["waiting", "error", "crashed", "canceled", "future-status"])(
    "projects actual %s without inventing success",
    async (status) => {
      const r = await propose();
      await service.confirm(owner, r.id, r.actionHash);
      records[0].status = status;
      records[0].waitTill =
        status === "waiting"
          ? new Date(Date.now() + 60_000).toISOString()
          : null;
      const observed = await service.refresh(owner, r.id);
      expect(observed.state).toBe(
        status === "waiting"
          ? "waiting"
          : status === "canceled"
            ? "cancelled"
            : ["error", "crashed"].includes(status)
              ? "failed"
              : "unknown",
      );
    },
  );
  it("preserves running status on read failures; stopped tracking never cancels external work", async () => {
    const r = await propose();
    await service.confirm(owner, r.id, r.actionHash);
    const observed = await service.refresh(owner, r.id);
    readError = true;
    const stale = await service.refresh(owner, r.id);
    expect(stale).toMatchObject({
      state: "running",
      syncedAt: observed.syncedAt,
      errorCode: "sync_error",
    });
    await service.stop(owner, r.id);
    await service.tick();
    expect(records[0].status).toBe("running");
    expect(creates).toBe(1);
  });
  it("retains success when results are malformed or unavailable and never stores a large dump", async () => {
    const r = await propose();
    await service.confirm(owner, r.id, r.actionHash);
    records[0].status = "success";
    records[0].result!.transformedText = "x".repeat(50000);
    expect(await service.refresh(owner, r.id)).toMatchObject({
      state: "succeeded",
      result: null,
      resultIssue: "malformed_result",
    });
    const read = adapter.readExecution;
    adapter.readExecution = async (w, id, data) => {
      if (data) throw new IntegrationError("provider");
      return read(w, id);
    };
    expect(await service.refresh(owner, r.id)).toMatchObject({
      state: "succeeded",
      result: null,
      resultIssue: "result_unavailable",
    });
  });
  it("isolates owners and rejects another owner's conversation, request, confirmation, refresh and stop", async () => {
    const requestId = randomUUID();
    const r = await service.propose(owner, requestId, contract.key, {
      text: "x",
    });
    for (const operation of [
      () => service.get("other", r.id),
      () => service.propose("other", requestId, contract.key, { text: "x" }),
      () => service.confirm("other", r.id, r.actionHash),
      () => service.refresh("other", r.id),
      () => service.stop("other", r.id),
    ])
      await expect(operation()).rejects.toMatchObject({ status: 404 });
    expect(await service.list("other")).toEqual([]);
    const conversationId = randomUUID();
    await store.beginTurn(
      owner,
      conversationId,
      randomUUID(),
      "Private synthetic conversation",
    );
    await expect(
      service.propose(
        "other",
        randomUUID(),
        contract.key,
        { text: "x" },
        conversationId,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(creates).toBe(0);
  });
  it("creates chat proposals through the same service and transaction, without a Paperclip task or execution", async () => {
    await service.syncCatalog(owner);
    let delegated = 0;
    const orchestrator = new OrchestrationService(
      store,
      {
        async complete() {
          return {
            reply: {
              kind: "automation",
              reply: "Siūlau saugų sintetinį bandymą.",
              automation: { key: contract.key, input: { text: "labas" } },
            },
            usage: null,
          };
        },
      },
      {
        listAgents: async () => [],
        createTask: async () => {
          delegated++;
          throw new Error("not permitted");
        },
        readTask: async () => {
          throw new Error("not permitted");
        },
        findByMarker: async () => [],
        taskUrl: () => "",
      },
      false,
      service,
    );
    const conversation = randomUUID(),
      request = randomUUID();
    const s = await orchestrator.submit(
      owner,
      conversation,
      request,
      "Pasiūlyk teksto bandymą",
    );
    expect(s.automationRuns).toHaveLength(1);
    expect(s.runs).toHaveLength(0);
    expect(creates).toBe(0);
    expect(delegated).toBe(0);
    await orchestrator.submit(
      owner,
      conversation,
      request,
      "Pasiūlyk teksto bandymą",
    );
    expect(await service.list(owner, conversation)).toHaveLength(1);
    await service.confirm(
      owner,
      s.automationRuns[0].id,
      s.automationRuns[0].actionHash,
    );
    expect(creates).toBe(1);
  });
  it("persists an interrupted submission across actual engine close/reopen and recovers without another create", async () => {
    await mkdir(".local/automation-tests", { recursive: true });
    const root = resolve(".local/automation-tests"),
      directory = await mkdtemp(resolve(root, "restart-"));
    expect(directory.startsWith(root)).toBe(true);
    let disk = await openTestDatabase(directory);
    try {
      await migrate(disk, resolve("db/migrations"));
      let s = new AutomationService(new Store(disk), adapter, settings);
      const r = await s.propose(owner, randomUUID(), contract.key, {
        text: "labas",
      });
      await disk.query(
        "UPDATE automation_requests SET state='submitting',confirmed_at=now(),confirmed_by=$2,submission_started_at=now()-interval '2 minutes' WHERE id=$1",
        [r.id, owner],
      );
      records.push({
        id: "interrupted",
        workflowId: contract.workflowId,
        status: "success",
        mode: "manual",
        startedAt: new Date().toISOString(),
        stoppedAt: new Date().toISOString(),
        waitTill: null,
        correlation: { requestId: r.id, text: "labas" },
        result: { requestId: r.id, transformedText: "LABAS" },
      });
      await disk.close();
      disk = await openTestDatabase(directory);
      await migrate(disk, resolve("db/migrations"));
      s = new AutomationService(new Store(disk), adapter, settings);
      await s.tick();
      expect(await s.get(owner, r.id)).toMatchObject({
        state: "succeeded",
        externalId: "interrupted",
        result: { transformedText: "LABAS" },
      });
      expect(creates).toBe(0);
    } finally {
      await disk.close();
      await rm(directory, { recursive: true });
    }
  });
});
