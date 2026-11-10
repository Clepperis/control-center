import { setTimeout as delay } from "node:timers/promises";
import { openPostgres } from "../src/server/db/postgres";
import { Store } from "../src/server/orchestration/store";
import { OrchestrationService } from "../src/server/orchestration/service";
import { PaperclipClient } from "../src/integrations/paperclip";
import { paperclipConfig, requireLiveMode } from "../src/server/config";
import { IntegrationError } from "../src/integrations/errors";
import type { DelegationAdapter } from "../src/integrations/paperclip";
import { configuredAutomations } from "../src/server/automations/configured";
import { KnowledgeService } from "../src/server/knowledge/service";
import { MarkdownFiles } from "../src/server/knowledge/files";
import { configuredImprovements } from "../src/server/improvements/configured";
requireLiveMode(process.env);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const db = openPostgres(process.env.DATABASE_URL);
// Recovery never invokes the gateway. Avoid requiring a gateway key just to reconcile.
const gateway = {
  async complete() {
    throw new Error("Reconciliation cannot call a model.");
  },
};
const unavailable = async () => {
  throw new IntegrationError("configuration");
};
let paperclip: DelegationAdapter = {
  listAgents: unavailable,
  createTask: unavailable,
  readTask: unavailable,
  findByMarker: unavailable,
  taskUrl: () => "",
};
try {
  paperclip = new PaperclipClient(paperclipConfig(process.env));
} catch {
  console.log(
    JSON.stringify({
      event: "paperclip_unconfigured",
      effect: "pending_turn_recovery_only",
    }),
  );
}
const service = new OrchestrationService(
  new Store(db),
  gateway,
  paperclip,
  false,
);
const automations = configuredAutomations(service.store);
const knowledge = process.env.KNOWLEDGE_ROOT
  ? new KnowledgeService(db, new MarkdownFiles(process.env.KNOWLEDGE_ROOT))
  : null;
const interval = Number(process.env.RECONCILE_INTERVAL_MS ?? 30000);
const improvements = configuredImprovements(db, knowledge);
if (!Number.isFinite(interval) || interval < 5000 || interval > 300000)
  throw new Error("RECONCILE_INTERVAL_MS must be between 5000 and 300000.");
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => controller.abort());
console.log(
  JSON.stringify({ event: "reconciler_started", intervalMs: interval }),
);
try {
  while (!controller.signal.aborted) {
    try {
      await service.tick();
      await automations.tick();
      if (knowledge) await knowledge.tick();
      await improvements.reconcileTick();
    } catch {
      console.error(
        JSON.stringify({
          event: "reconciliation_failed",
          code: "storage_or_configuration",
        }),
      );
    }
    try {
      await delay(interval, undefined, { signal: controller.signal });
    } catch {
      break;
    }
  }
} finally {
  await db.close();
}
