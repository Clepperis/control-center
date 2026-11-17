import { checkToolHubAccess, toolHubOwner } from "@/server/toolhub/access";
import { createToolHubHandler } from "@/server/toolhub/server";
import { configuredToolHub } from "@/server/runtime";
import { logEvent } from "@/server/observability/log";

/**
 * Tool Hub: an MCP endpoint that gives agents (Codex, Claude Code, Hermes)
 * the owner's tools. Bearer-token only; outward actions become requests the
 * owner approves in Control Center.
 */
async function handle(request: Request): Promise<Response> {
  const access = checkToolHubAccess(
    process.env,
    request.headers.get("authorization"),
  );
  if (access === "disabled")
    return Response.json({ error: "tool_hub_disabled" }, { status: 503 });
  if (access === "denied") {
    logEvent("toolhub.denied", {});
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }
  const owner = toolHubOwner(process.env);
  if (!owner || process.env.DATA_MODE !== "live")
    return Response.json({ error: "tool_hub_unavailable" }, { status: 503 });
  return createToolHubHandler(configuredToolHub(owner)).fetch(request);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
