import { z } from "zod";
import type { Env } from "./auth/policy";
import { IntegrationError } from "@/integrations/errors";
import { textContract, type AutomationContract } from "@/domain/automations";
import type { ModelRoutes } from "./models/routing";
export interface GatewayConfig {
  apiKey: string;
  /** Default model; also used for any tier without its own model. */
  model: string;
  routes?: ModelRoutes;
  maxTokens: number;
  timeoutMs: number;
  enabled: boolean;
}
export interface PaperclipConfig {
  baseUrl: string;
  apiKey: string;
  companyId: string;
  agentIds: string[];
  enabled: boolean;
  contractVerified: boolean;
}
const nonempty = z.string().trim().min(1);
// An empty `NAME=` line in an env file means "not configured".
const optionalModel = z.preprocess(
  (v) => (typeof v === "string" && !v.trim() ? undefined : v),
  z.string().trim().min(1).max(200).optional(),
);
export function gatewayConfig(env: Env): GatewayConfig {
  const value = z
    .object({
      NEXOS_API_KEY: nonempty,
      NEXOS_MODEL: nonempty,
      NEXOS_MODEL_FAST: optionalModel,
      NEXOS_MODEL_STANDARD: optionalModel,
      NEXOS_MODEL_STRONG: optionalModel,
      NEXOS_MAX_COMPLETION_TOKENS: z.coerce
        .number()
        .int()
        .min(64)
        .max(4096)
        .default(1200),
      NEXOS_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(1000)
        .max(60000)
        .default(30000),
    })
    .safeParse(env);
  if (!value.success) throw new IntegrationError("configuration");
  return {
    apiKey: value.data.NEXOS_API_KEY,
    model: value.data.NEXOS_MODEL,
    routes: Object.fromEntries(
      (
        [
          ["fast", value.data.NEXOS_MODEL_FAST],
          ["standard", value.data.NEXOS_MODEL_STANDARD],
          ["strong", value.data.NEXOS_MODEL_STRONG],
        ] as const
      ).filter(([, model]) => model !== undefined),
    ) as ModelRoutes,
    maxTokens: value.data.NEXOS_MAX_COMPLETION_TOKENS,
    timeoutMs: value.data.NEXOS_TIMEOUT_MS,
    enabled: env.LIVE_MODEL_ENABLED === "true",
  };
}
export function paperclipConfig(env: Env): PaperclipConfig {
  const value = z
    .object({
      PAPERCLIP_BASE_URL: z.url(),
      PAPERCLIP_BOARD_API_KEY: z.string().startsWith("pcp_board_"),
      PAPERCLIP_COMPANY_ID: z.uuid(),
    })
    .safeParse(env);
  if (!value.success) throw new IntegrationError("configuration");
  const url = new URL(value.data.PAPERCLIP_BASE_URL);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new IntegrationError("configuration");
  const agentIds = (env.PAPERCLIP_AGENT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!z.array(z.uuid()).safeParse(agentIds).success)
    throw new IntegrationError("configuration");
  return {
    baseUrl: url.origin,
    apiKey: value.data.PAPERCLIP_BOARD_API_KEY,
    companyId: value.data.PAPERCLIP_COMPANY_ID,
    agentIds,
    enabled: env.LIVE_DELEGATION_ENABLED === "true",
    contractVerified: env.PAPERCLIP_CONTRACT_VERIFIED === "true",
  };
}
export function requireLiveMode(env: Env) {
  if (env.DATA_MODE !== "live") throw new IntegrationError("disabled");
}
export interface N8nConfig {
  origin: string;
  token: string;
  timeoutMs: number;
  enabled: boolean;
  contract: AutomationContract | null;
}
export function n8nConfig(env: Env): N8nConfig {
  const parsed = z
    .object({
      N8N_ORIGIN: z.url(),
      N8N_MCP_TOKEN: z
        .string()
        .min(16)
        .max(8192)
        .regex(/^[A-Za-z0-9._~+/=-]+$/),
      N8N_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(1000)
        .max(15000)
        .default(8000),
      N8N_EXECUTION_ENABLED: z.enum(["true", "false"]).default("false"),
    })
    .safeParse(env);
  if (!parsed.success) throw new IntegrationError("configuration");
  const url = new URL(parsed.data.N8N_ORIGIN);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new IntegrationError("configuration");
  const id = env.N8N_TEXT_WORKFLOW_ID?.trim(),
    version = env.N8N_TEXT_WORKFLOW_VERSION?.trim();
  if (
    (id || version) &&
    (!id ||
      !version ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
      !z.uuid().safeParse(version).success)
  )
    throw new IntegrationError("configuration");
  return {
    origin: url.origin,
    token: parsed.data.N8N_MCP_TOKEN,
    timeoutMs: parsed.data.N8N_TIMEOUT_MS,
    enabled: parsed.data.N8N_EXECUTION_ENABLED === "true",
    contract: id && version ? textContract(id, version) : null,
  };
}
