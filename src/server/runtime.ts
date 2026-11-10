import "server-only";
import { openPostgres } from "./db/postgres";
import { Store } from "./orchestration/store";
import { OrchestrationService } from "./orchestration/service";
import { NexosGateway, type PlanningGateway } from "@/integrations/nexos";
import {
  PaperclipClient,
  type DelegationAdapter,
} from "@/integrations/paperclip";
import { IntegrationError } from "@/integrations/errors";
import {
  gatewayConfig,
  paperclipConfig,
  n8nConfig,
  requireLiveMode,
} from "./config";
import type { Database } from "./db/types";
import { configuredAutomations } from "./automations/configured";
import { KnowledgeService } from "./knowledge/service";
import { MarkdownFiles } from "./knowledge/files";
import { configuredImprovements } from "./improvements/configured";
import { DatabaseUsageSink, logOnlyUsageSink } from "./observability/usage";
const globalDb = globalThis as typeof globalThis & {
  controlCenterDb?: Database;
};
export function getStore() {
  requireLiveMode(process.env);
  if (!process.env.DATABASE_URL) throw new IntegrationError("configuration");
  globalDb.controlCenterDb ??= openPostgres(process.env.DATABASE_URL);
  return new Store(globalDb.controlCenterDb);
}
export function configuredAdapters(db?: Database) {
  let gateway: PlanningGateway = {
    async complete() {
      throw new IntegrationError("configuration");
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
    gateway = new NexosGateway(
      gatewayConfig(process.env),
      fetch,
      db ? new DatabaseUsageSink(db) : logOnlyUsageSink,
    );
  } catch {
    /* Unavailable is an explicit state, not a fallback provider. */
  }
  try {
    paperclip = new PaperclipClient(paperclipConfig(process.env));
  } catch {
    /* Missing configuration remains unavailable. */
  }
  return { gateway, paperclip };
}
export function getService() {
  const store = getStore();
  const adapters = configuredAdapters(store.db);
  return new OrchestrationService(
    store,
    adapters.gateway,
    adapters.paperclip,
    process.env.LIVE_DELEGATION_ENABLED === "true",
    getAutomationService(),
    getKnowledgeService(),
  );
}
export function getAutomationService() {
  return configuredAutomations(getStore());
}
export function getKnowledgeService() {
  return new KnowledgeService(
    getStore().db,
    new MarkdownFiles(process.env.KNOWLEDGE_ROOT ?? ""),
  );
}
export function getImprovementService() {
  return configuredImprovements(
    getStore().db,
    process.env.KNOWLEDGE_ROOT ? getKnowledgeService() : null,
  );
}
export function setupStatus() {
  let n8nExecutionEnabled = false;
  try {
    n8nExecutionEnabled = n8nConfig(process.env).enabled;
  } catch {}
  let model = "Trūksta NEXOS_API_KEY arba NEXOS_MODEL.";
  let modelEnabled = false;
  try {
    const c = gatewayConfig(process.env);
    modelEnabled = c.enabled;
    model = c.enabled
      ? "Modelis sukonfigūruotas; tiesioginis kvietimas galimas."
      : "Modelio kvietimai išjungti (LIVE_MODEL_ENABLED=false).";
  } catch {}
  let paperclip =
    "Trūksta atskiro Paperclip operatoriaus rakto, adreso arba organizacijos.";
  try {
    const c = paperclipConfig(process.env);
    paperclip = !c.contractVerified
      ? "Įdiegtos REST sutarties patikra dar nepatvirtinta."
      : !c.agentIds.length
        ? "Nenurodytas nė vienas leidžiamas agentas."
        : !c.enabled
          ? "Delegavimas išjungtas (LIVE_DELEGATION_ENABLED=false)."
          : "Prieš deleguojant bus patikrinta agento parengtis.";
  } catch {}
  return {
    database: !!process.env.DATABASE_URL,
    model,
    paperclip,
    modelEnabled,
    n8nExecutionEnabled,
  };
}
export function taskUrl(id: string) {
  return configuredAdapters().paperclip.taskUrl(id) || null;
}
