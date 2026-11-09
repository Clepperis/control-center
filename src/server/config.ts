import { z } from "zod";
import type { Env } from "./auth/policy";
import { IntegrationError } from "@/integrations/errors";
export interface GatewayConfig {
  apiKey: string;
  model: string;
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
export function gatewayConfig(env: Env): GatewayConfig {
  const value = z
    .object({
      NEXOS_API_KEY: nonempty,
      NEXOS_MODEL: nonempty,
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
