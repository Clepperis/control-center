import { config, definition, contract } from "./automation-fixtures";
// Test-only MCP/HTTP substitute. It never opens a socket or authenticates to an external service.
export function n8nHttpFixture() {
  const executions = new Map<
    string,
    { requestId: string; text: string; status: string }
  >();
  const state = {
    submissions: 0,
    unauthorized: false,
    loseSubmission: false,
    unavailable: false,
  };
  const json = (v: unknown, status = 200) =>
    new Response(JSON.stringify(v), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url) !== `${config.origin}/mcp-server/http`)
      throw new Error("Test fixture forbids unrelated network requests");
    if (init?.method === "GET") return new Response(null, { status: 405 });
    const b = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    if (b?.method === "initialize")
      return json({
        jsonrpc: "2.0",
        id: b.id,
        result: {
          protocolVersion: "2025-11-25",
          capabilities: { tools: {} },
          serverInfo: { name: "synthetic-n8n", version: "test-only" },
        },
      });
    if (b?.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (state.unauthorized)
      return json({ error: "synthetic permission denial" }, 403);
    if (state.unavailable) return json({ error: "synthetic unavailable" }, 503);
    const name = b?.params?.name,
      args = b?.params?.arguments ?? {};
    let result: unknown;
    if (name === "search_workflows")
      result = {
        data: [
          {
            id: contract.workflowId,
            name: "SINTETINIS · Saugus teksto bandymas",
            description: "Tik automatizuoto naršyklės bandymo duomenys.",
            active: false,
            availableInMCP: true,
          },
          {
            id: "business-example",
            name: "SINTETINIS · Neleidžiama darbo eiga",
            active: true,
            availableInMCP: true,
          },
        ],
        count: 2,
      };
    else if (name === "get_workflow_details") result = definition();
    else if (name === "execute_workflow") {
      if (
        args.executionMode !== "manual" ||
        args.triggerNodeName !== "Synthetic input"
      )
        throw new Error("Unexpected fixture execution contract");
      state.submissions++;
      const id = String(state.submissions),
        input = args.inputs.webhookData.body;
      executions.set(id, {
        requestId: input.requestId,
        text: input.text,
        status: "running",
      });
      if (state.loseSubmission)
        throw new Error("Synthetic connection loss after acceptance");
      result = { executionId: id, status: "started" };
    } else if (name === "search_workflow_executions")
      result = {
        data: [...executions.keys()].slice(0, 5).map((id) => ({
          id,
          workflowId: contract.workflowId,
          mode: "manual",
        })),
        nextCursor: null,
      };
    else if (name === "get_workflow_execution") {
      const e = executions.get(args.executionId);
      if (!e) throw new Error("No fixture execution");
      result = {
        execution: {
          id: args.executionId,
          workflowId: contract.workflowId,
          status: e.status,
          mode: "manual",
          startedAt: "2026-11-10T08:00:00.000Z",
          stoppedAt: e.status === "success" ? "2026-11-10T08:00:01.000Z" : null,
          waitTill: null,
        },
        ...(args.includeData
          ? {
              data: {
                resultData: {
                  runData: {
                    "Synthetic input": [
                      {
                        data: {
                          main: [
                            [
                              {
                                json: {
                                  body: {
                                    requestId: e.requestId,
                                    text: e.text,
                                  },
                                },
                              },
                            ],
                          ],
                        },
                      },
                    ],
                    "Transform text": [
                      {
                        data: {
                          main: [
                            [
                              {
                                json: {
                                  requestId: e.requestId,
                                  transformedText: e.text.trim().toUpperCase(),
                                },
                              },
                            ],
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            }
          : {}),
      };
    } else throw new Error("Unexpected test MCP tool");
    return json({
      jsonrpc: "2.0",
      id: b.id,
      result: {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      },
    });
  };
  return { fetcher, state, executions, config };
}
