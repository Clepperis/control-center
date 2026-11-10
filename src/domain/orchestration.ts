import { z } from "zod";
import { automationProposalSchema } from "./automations";
import {
  memorySuggestion,
  type Grounding,
  type KnowledgeScope,
} from "./knowledge";
export const planSchema = z
  .object({
    objective: z.string().min(1).max(1000),
    title: z.string().min(1).max(160),
    boundedTask: z.string().min(1).max(6000),
    agentId: z.string().uuid().nullable(),
    completionCriteria: z.array(z.string().min(1).max(500)).min(1).max(6),
    constraints: z.array(z.string().min(1).max(500)).max(8),
  })
  .strict();
export type Plan = z.infer<typeof planSchema> & { agentName?: string };
export const replySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("memory"),
      reply: z.string().min(1).max(3000),
      memory: memorySuggestion,
    })
    .strict(),
  z
    .object({
      kind: z.literal("automation"),
      reply: z.string().min(1).max(3000),
      automation: automationProposalSchema,
    })
    .strict(),
  z
    .object({ kind: z.literal("answer"), reply: z.string().min(1).max(10000) })
    .strict(),
  z
    .object({
      kind: z.literal("plan"),
      reply: z.string().min(1).max(3000),
      plan: planSchema,
    })
    .strict(),
]);
export type ModelReply = z.infer<typeof replySchema>;
export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  credits?: number;
  /** Routing facts persisted with the reply so the owner can see them. */
  model?: string;
  tier?: "fast" | "standard" | "strong";
  fallback?: boolean;
}
export type RunState =
  | "awaiting_confirmation"
  | "delegating"
  | "delegated"
  | "running"
  | "review"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";
export interface Run {
  id: string;
  conversationId: string;
  state: RunState;
  plan: Plan;
  planHash: string;
  confirmedAt: string | null;
  externalTaskId: string | null;
  externalStatus: string | null;
  syncedAt: string | null;
  errorCode: string | null;
  tracking: boolean;
  result: {
    identifier: string;
    title: string;
    description: string | null;
    comments: string[];
  } | null;
  createdAt: string;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  usage: Usage | null;
  grounding?: Grounding | null;
  scope?: KnowledgeScope | null;
}
export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}
export interface Turn {
  id: string;
  conversationId: string;
  status: "pending" | "completed" | "failed";
  errorCode: string | null;
}
export const terminalStates: RunState[] = ["completed", "failed", "cancelled"];
const transitions: Record<RunState, RunState[]> = {
  awaiting_confirmation: ["delegating", "blocked", "cancelled"],
  delegating: [
    "delegated",
    "running",
    "review",
    "completed",
    "blocked",
    "failed",
    "cancelled",
  ],
  delegated: [
    "delegated",
    "running",
    "review",
    "completed",
    "blocked",
    "cancelled",
  ],
  running: [
    "running",
    "delegated",
    "review",
    "completed",
    "blocked",
    "cancelled",
  ],
  review: [
    "review",
    "running",
    "delegated",
    "completed",
    "blocked",
    "cancelled",
  ],
  blocked: [
    "blocked",
    "delegated",
    "running",
    "review",
    "completed",
    "cancelled",
  ],
  completed: [],
  failed: [],
  cancelled: [],
};
export function assertTransition(from: RunState, to: RunState) {
  if (!transitions[from].includes(to))
    throw new Error(`Invalid run transition: ${from} -> ${to}`);
}
export function mapPaperclipStatus(status: string): RunState {
  switch (status) {
    case "backlog":
    case "todo":
      return "delegated";
    case "in_progress":
      return "running";
    case "in_review":
      return "review";
    case "done":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return "blocked";
  }
}
export function isStale(syncedAt: string | null, now = Date.now()) {
  return !syncedAt || now - new Date(syncedAt).getTime() > 90_000;
}
export const runLabels: Record<RunState, string> = {
  awaiting_confirmation: "Laukia jūsų patvirtinimo",
  delegating: "Perduodama Paperclip",
  delegated: "Užduotis sukurta",
  running: "Paperclip: vykdoma",
  review: "Paperclip: peržiūrima",
  completed: "Paperclip: baigta",
  failed: "Nepavyko",
  blocked: "Reikia dėmesio",
  cancelled: "Atšaukta",
};
export const errorLabels: Record<string, string> = {
  configuration: "Trūksta programos konfigūracijos.",
  disabled: "Tiesioginiai kvietimai dar neleidžiami.",
  authentication: "Paslaugos prisijungimas atmestas.",
  rate_limit: "Pasiektas paslaugos užklausų limitas.",
  provider: "Paslauga grąžino klaidą.",
  timeout: "Baigėsi užklausai skirtas laikas.",
  cancelled: "Užklausa nutraukta.",
  malformed: "Paslaugos atsakymo formatas neatitinka sutarties.",
  agent_unavailable:
    "Pasirinktas agentas neparengtas arba neleidžiamas. Agentas nebuvo aktyvuotas.",
  interrupted:
    "Atsakymo gavimas nutrūko. Žinutė išsaugota; modelio kvietimas nekartojamas automatiškai.",
  creation_uncertain:
    "Nežinoma, ar užduotis sukurta. Tikrinkite susiejimą; nauja užduotis automatiškai nekuriama.",
  multiple_matches:
    "Rastos kelios galimos užduotys. Reikia rankinio sutikrinimo Paperclip.",
  external_blocked: "Paperclip nurodo, kad darbas užblokuotas.",
  external_unknown: "Neatpažinta Paperclip būsena. Reikia patikrinti sutartį.",
  sync_error:
    "Būsenos atnaujinti nepavyko. Rodomi paskutiniai išsaugoti duomenys.",
};
