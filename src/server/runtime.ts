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
import { usageStatistics } from "./observability/stats";
import type { ToolHubDeps } from "./toolhub/server";
import { DatabaseToolCallSink } from "./toolhub/audit";
import { LessonService } from "./learning/service";
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
    getLessonService(),
  );
}
export function getLessonService() {
  return new LessonService(getStore().db);
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
/** Read-only nexos catalog of chat-capable models (no completion request). */
export async function chatModelCatalog() {
  return new NexosGateway(gatewayConfig(process.env)).chatModels();
}
/** Tool Hub dependencies bound to the owner and the live services. */
export function configuredToolHub(owner: string): ToolHubDeps {
  const db = () => getStore().db;
  return {
    async searchKnowledge(query, projectId) {
      // Knowledge needs a private Markdown root; report setup, not a crash.
      if (!process.env.KNOWLEDGE_ROOT)
        throw new IntegrationError("configuration");
      const passages = await getKnowledgeService().search(
        owner,
        { projectId, includeGlobal: true },
        query,
      );
      return passages.map((p) => ({
        citation: p.citation,
        title: p.title,
        heading: p.heading ?? null,
        content: p.content,
      }));
    },
    usageStats: (days) => usageStatistics(db(), days),
    async listAutomations() {
      const contracts = await getAutomationService().offered(owner);
      return contracts.map(({ key, name, purpose }) => ({
        key,
        name,
        purpose,
      }));
    },
    async proposeAutomation(requestId, key, text) {
      const run = await getAutomationService().propose(owner, requestId, key, {
        text,
      });
      return { id: run.id, state: run.state };
    },
    async proposeLesson(text) {
      const l = await getLessonService().propose(owner, {
        text,
        source: "agent",
      });
      return { id: l.id, state: l.state, occurrences: l.occurrences };
    },
    approvedLessons: () => getLessonService().approved(owner),
    audit: new DatabaseToolCallSink(db()),
  };
}
