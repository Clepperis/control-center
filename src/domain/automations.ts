import { z } from "zod";

export const automationKey = "safe-text-v1" as const;
export const automationInputSchema = z
  .object({ text: z.string().trim().min(1).max(240) })
  .strict();
export type AutomationInput = z.infer<typeof automationInputSchema>;
export const automationProposalSchema = z
  .object({
    key: z.literal(automationKey),
    input: automationInputSchema,
  })
  .strict();
export interface AutomationContract {
  key: typeof automationKey;
  workflowId: string;
  versionId: string;
  name: string;
  purpose: string;
  effects: string[];
  method: "mcp-manual";
  spendsMoney: false;
  contactsServices: false;
}
export function textContract(
  workflowId: string,
  versionId: string,
): AutomationContract {
  return {
    key: automationKey,
    workflowId,
    versionId,
    name: "Saugus teksto bandymas",
    purpose:
      "Pašalinti tarpus teksto pradžioje ir pabaigoje, pakeisti raides didžiosiomis.",
    effects: [
      "n8n atliks vieną rankinį bandymą ir gali išsaugoti jo istoriją.",
      "Jokių laiškų, failų, verslo duomenų pakeitimų ar mokamų modelių.",
    ],
    method: "mcp-manual",
    spendsMoney: false,
    contactsServices: false,
  };
}
export type AutomationState =
  | "awaiting_confirmation"
  | "submitting"
  | "accepted"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "unknown";
export const automationLabels: Record<AutomationState, string> = {
  awaiting_confirmation: "Laukia jūsų patvirtinimo",
  submitting: "Siunčiama n8n",
  accepted: "n8n priimta",
  running: "n8n vykdoma",
  waiting: "n8n laukia",
  succeeded: "n8n baigta",
  failed: "Nepavyko",
  cancelled: "Atšaukta",
  unknown: "Būsena nežinoma",
};
export const automationErrors: Record<string, string> = {
  not_configured: "Nurodykite atskirą programos n8n adresą ir MCP raktą.",
  configuration:
    "n8n konfigūracija netinkama. Patikrinkite serverio aplinkos kintamuosius.",
  disabled: "n8n vykdymas išjungtas. Skaitymo patikros leidžiamos.",
  authentication: "n8n prieiga atmesta. Patikrinkite programos rakto teises.",
  rate_limit: "n8n užklausų limitas pasiektas. Palaukite prieš kitą patikrą.",
  provider: "n8n nepasiekiama arba užklausa atmesta.",
  timeout: "n8n neatsakė per skirtą laiką.",
  malformed: "n8n atsakymo formatas neatitinka patikrintos sutarties.",
  contract_changed:
    "Darbo eigos versija arba turinys pasikeitė. Reikia naujos sutarties patikros ir patvirtinimo.",
  not_eligible: "Ši darbo eiga neleidžiama vykdyti per Control Center.",
  submission_unknown:
    "Nežinoma, ar n8n priėmė užklausą. Automatinis pakartotinis siuntimas draudžiamas.",
  submission_rejected:
    "n8n atmetė paleidimą; vykdymo identifikatorius negautas.",
  sync_error:
    "Būsenos sutikrinti nepavyko. Rodomas paskutinis išsaugotas stebėjimas.",
  result_unavailable:
    "Rezultato perskaityti nepavyko. Patikrinkite ryšį, duomenų išsaugojimą ir prieigą n8n; labai dideli atsakymai nerodomi.",
  malformed_result:
    "n8n praneša sėkmę, bet laukiamas mažas rezultatas negautas arba netinkamas.",
  external_failed:
    "n8n praneša vykdymo klaidą. Išsamią priežastį peržiūrėkite n8n.",
  external_unknown: "n8n grąžino neatpažintą būseną.",
  origin_changed:
    "Pasikeitė n8n serveris. Ankstesnis vykdymas prie naujo serverio nesiejamas.",
  confirmation_expired:
    "Patvirtinimo peržiūra paseno. Parenkite naują užklausą.",
};
export function mapN8nStatus(status: string): AutomationState {
  switch (status) {
    case "new":
      return "accepted";
    case "running":
      return "running";
    case "waiting":
      return "waiting";
    case "success":
      return "succeeded";
    case "error":
    case "crashed":
      return "failed";
    case "canceled":
      return "cancelled";
    default:
      return "unknown";
  }
}
export interface AutomationRun {
  id: string;
  conversationId: string | null;
  state: AutomationState;
  contract: AutomationContract;
  input: AutomationInput;
  actionHash: string;
  confirmedAt: string | null;
  externalId: string | null;
  externalStatus: string | null;
  syncedAt: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  waitTill: string | null;
  errorCode: string | null;
  result: { transformedText: string } | null;
  resultIssue: string | null;
  tracking: boolean;
  createdAt: string;
  expiresAt: string;
  workflowUrl?: string | null;
  executionUrl?: string | null;
}
export interface CatalogWorkflow {
  id: string;
  name: string;
  description: string | null;
  active: boolean | null;
  availableInMCP: boolean;
  eligible: boolean;
  reason: string | null;
  versionId: string | null;
  workflowUrl: string;
  lastExecution?: { status: string; startedAt: string | null } | null;
}
export interface AutomationCatalog {
  state:
    | "not_configured"
    | "configured"
    | "connected"
    | "unauthorized"
    | "unavailable"
    | "stale";
  workflows: CatalogWorkflow[];
  syncedAt: string | null;
  errorCode: string | null;
  truncated: boolean;
  contract: AutomationContract | null;
  executionEnabled: boolean;
}
