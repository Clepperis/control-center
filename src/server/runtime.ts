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
import { gatewayConfig, paperclipConfig, requireLiveMode } from "./config";
import type { Database } from "./db/types";
const globalDb = globalThis as typeof globalThis & {
  controlCenterDb?: Database;
};
export function getStore() {
  requireLiveMode(process.env);
  if (!process.env.DATABASE_URL) throw new IntegrationError("configuration");
  globalDb.controlCenterDb ??= openPostgres(process.env.DATABASE_URL);
  return new Store(globalDb.controlCenterDb);
}
export function configuredAdapters() {
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
    gateway = new NexosGateway(gatewayConfig(process.env));
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
  const adapters = configuredAdapters();
  return new OrchestrationService(
    getStore(),
    adapters.gateway,
    adapters.paperclip,
    process.env.LIVE_DELEGATION_ENABLED === "true",
  );
}
export function setupStatus() {
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
  };
}
export function taskUrl(id: string) {
  return configuredAdapters().paperclip.taskUrl(id) || null;
}
