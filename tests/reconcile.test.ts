import { afterEach, beforeEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { openTestDatabase } from "./pglite";
import { migrate } from "../src/server/db/migrate";
import { ImprovementService } from "../src/server/improvements/service";
import { KnowledgeService } from "../src/server/knowledge/service";
import { MarkdownFiles } from "../src/server/knowledge/files";
import { runReconcilers } from "../src/server/reconcile";
import type { Database } from "../src/server/db/types";
import type { ImprovementCommand } from "../src/domain/improvements";
import { improvementFixture, plan } from "./improvement-fixtures";
import { fingerprint } from "../src/server/improvements/safety";

let db: Database;
const owner = "synthetic-owner";
beforeEach(async () => {
  db = await openTestDatabase();
  await migrate(db, resolve("db/migrations"));
});
afterEach(async () => {
  await db.close();
});
it("still delivers an owner's cancellation when the knowledge volume is unavailable", async () => {
  const f = improvementFixture(),
    s = new ImprovementService(db, f.repo, f.planner, f.executor),
    // A relative root is rejected exactly like an unmounted private volume.
    knowledge = new KnowledgeService(db, new MarkdownFiles("unavailable"));
  const command = async (action: string, extra: object = {}) => {
    const r = (await s.list(owner))[0];
    return s.command(owner, {
      action,
      id: r.id,
      version: r.version,
      ...extra,
    } as ImprovementCommand);
  };
  await s.create(
    owner,
    randomUUID(),
    "Patikslinti tuščią būseną.",
    null,
    false,
  );
  await command("investigate", { paths: plan.scope });
  await s.tick();
  await command("authorize", {
    planHash: (await s.list(owner))[0].planHash,
    policyHash: fingerprint(f.policy),
  });
  await s.tick();
  expect(f.state.creates).toBe(1);
  await command("cancel");
  await expect(knowledge.tick()).rejects.toMatchObject({
    code: "knowledge_configuration",
  });
  const reported: string[] = [];
  const failed = await runReconcilers(
    [
      { name: "knowledge", run: () => knowledge.tick() },
      { name: "improvements", run: () => s.reconcileTick() },
    ],
    (line) => reported.push(line),
  );
  expect(failed).toEqual(["knowledge"]);
  expect(JSON.parse(reported[0])).toMatchObject({
    event: "reconciliation_failed",
    step: "knowledge",
  });
  expect(f.state.cancels).toBe(1);
  expect((await s.list(owner))[0].job).toBeNull();
});
