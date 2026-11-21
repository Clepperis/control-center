import { createHash, timingSafeEqual } from "node:crypto";
import type { Env } from "../auth/policy";

const MIN_TOKEN = 32;
export type ToolHubAccess = "ok" | "denied" | "disabled";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Tool Hub is off unless a strong TOOL_HUB_TOKEN is configured. */
export function checkToolHubAccess(
  env: Env,
  authorization: string | null,
): ToolHubAccess {
  const token = env.TOOL_HUB_TOKEN;
  if (!token || token.length < MIN_TOKEN) return "disabled";
  const match = /^Bearer (.+)$/.exec(authorization ?? "");
  if (!match) return "denied";
  return timingSafeEqual(digest(match[1]), digest(token)) ? "ok" : "denied";
}

/** The owner whose data Tool Hub acts on: the same identity the UI uses. */
export function toolHubOwner(env: Env): string | null {
  if (env.AUTH_MODE === "development")
    return env.NODE_ENV === "development" || env.NODE_ENV === "test"
      ? "development-owner"
      : null;
  return env.OWNER_SUBJECT?.trim() || null;
}
