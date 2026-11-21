import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { z } from "zod";
import type { AutomationAdapter, AutomationExecution } from "./contracts";
import type { AutomationContract, CatalogWorkflow } from "@/domain/automations";
import type { N8nConfig } from "@/server/config";
import { IntegrationError, type Fetcher } from "./errors";
import { canonicalJson } from "@/server/canonical-json";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const date = z.string().datetime({ offset: true }).nullable();
export interface N8nToolCaller {
  call(
    name: string,
    args: Record<string, unknown>,
    mutation?: boolean,
  ): Promise<unknown>;
}

/** Authenticated, fixed-origin MCP only. No OAuth discovery or application-side credentials creation. */
export class N8nTransport implements N8nToolCaller {
  constructor(
    private config: N8nConfig,
    private fetcher: Fetcher = fetch,
  ) {}
  async call(
    name: string,
    args: Record<string, unknown>,
    mutation = false,
  ): Promise<unknown> {
    if (
      ![
        "search_workflows",
        "get_workflow_details",
        "execute_workflow",
        "get_workflow_execution",
        "search_workflow_executions",
      ].includes(name) ||
      mutation !== (name === "execute_workflow")
    )
      throw new IntegrationError("configuration");
    const attempts = mutation ? 1 : 2;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const timeout = AbortSignal.timeout(this.config.timeoutMs);
      let submissionSent = false;
      const client = new Client({ name: "control-center", version: "0.3.0" });
      client.onerror = () => {}; // Normalize failures below without provider-body or endpoint logging.
      const endpoint = `${this.config.origin}/mcp-server/http`;
      const boundedFetch: Fetcher = async (url, init) => {
        if (String(url) !== endpoint)
          throw new IntegrationError("configuration");
        const body =
          typeof init?.body === "string" ? JSON.parse(init.body) : null;
        const submits =
          body?.method === "tools/call" &&
          body?.params?.name === "execute_workflow";
        if (submits && submissionSent)
          throw new IntegrationError("provider", true);
        if (submits) submissionSent = true; // The transport cannot replay a mutation, even after a broken session.
        const response = await this.fetcher(url, {
          ...init,
          redirect: "error",
          cache: "no-store",
          signal: timeout,
        });
        if (!response.ok && response.status !== 405) {
          await response.body?.cancel();
          throw new IntegrationError(
            response.status === 401 || response.status === 403
              ? "authentication"
              : response.status === 429
                ? "rate_limit"
                : "provider",
            submissionSent,
          );
        }
        if (!response.body) return response;
        let bytes = 0;
        const stream = response.body.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              bytes += chunk.byteLength;
              if (bytes > 1_000_000)
                throw new IntegrationError("malformed", submissionSent);
              controller.enqueue(chunk);
            },
          }),
        );
        return new Response(stream, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      };
      const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
        fetch: boundedFetch,
        requestInit: {
          headers: { Authorization: `Bearer ${this.config.token}` },
          redirect: "error",
        },
        reconnectionOptions: {
          maxRetries: 0,
          initialReconnectionDelay: 100,
          maxReconnectionDelay: 100,
          reconnectionDelayGrowFactor: 1,
        },
      });
      try {
        await client.connect(transport, {
          timeout: this.config.timeoutMs,
          signal: timeout,
        });
        const result = await client.callTool(
          { name, arguments: args },
          { timeout: this.config.timeoutMs, signal: timeout },
        );
        if (result.isError)
          throw new IntegrationError("provider", submissionSent);
        let value = result.structuredContent;
        if (!value) {
          const content = result.content.filter((c) => c.type === "text");
          if (content.length !== 1 || content[0].type !== "text")
            throw new IntegrationError("malformed", submissionSent);
          value = JSON.parse(content[0].text);
        }
        if (!value || typeof value !== "object")
          throw new IntegrationError("malformed", submissionSent);
        if (
          "error" in value &&
          value.error &&
          !(mutation && "status" in value && value.status === "error")
        )
          throw new IntegrationError("provider", submissionSent);
        return value;
      } catch (error) {
        const normalized =
          error instanceof IntegrationError
            ? error
            : new IntegrationError(
                timeout.aborted ? "timeout" : "provider",
                submissionSent,
              );
        if (
          attempt + 1 === attempts ||
          !["provider", "timeout"].includes(normalized.code)
        )
          throw normalized;
        await new Promise((resolve) => setTimeout(resolve, 150));
      } finally {
        await client.close().catch(() => {});
      }
    }
    throw new IntegrationError("provider");
  }
}

export const safeTriggerParameters = {
  httpMethod: "POST",
  path: "control-center-safe-text",
  authentication: "none",
  responseMode: "lastNode",
  options: {},
};
export const safeTransformParameters = {
  mode: "manual",
  includeOtherFields: false,
  assignments: {
    assignments: [
      {
        id: "correlation",
        name: "requestId",
        value: "={{ $json.body.requestId }}",
        type: "string",
      },
      {
        id: "transformed",
        name: "transformedText",
        value: "={{ String($json.body.text).trim().toUpperCase() }}",
        type: "string",
      },
    ],
  },
  options: {},
};
const graph = {
  "Synthetic input": {
    main: [[{ node: "Transform text", type: "main", index: 0 }]],
  },
};
export function verifySafeDefinition(
  raw: unknown,
  contract: AutomationContract,
) {
  const parsed = z
    .object({
      workflow: z.object({
        id,
        versionId: z.string(),
        active: z.boolean(),
        activeVersionId: z.string().nullable(),
        canExecute: z.boolean(),
        isArchived: z.boolean(),
        settings: z.record(z.string(), z.unknown()),
        nodes: z.array(z.record(z.string(), z.unknown())).length(2),
        connections: z.unknown(),
      }),
    })
    .safeParse(raw);
  if (!parsed.success) throw new IntegrationError("malformed");
  const w = parsed.data.workflow;
  if (!w.canExecute || !w.settings.availableInMCP)
    throw new IntegrationError("authentication");
  if (
    w.id !== contract.workflowId ||
    w.versionId !== contract.versionId ||
    w.isArchived ||
    w.active ||
    w.activeVersionId ||
    w.settings.errorWorkflow ||
    canonicalJson(w.connections) !== canonicalJson(graph)
  )
    throw new IntegrationError("malformed");
  const expected = [
    {
      name: "Synthetic input",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2.2,
      parameters: safeTriggerParameters,
    },
    {
      name: "Transform text",
      type: "n8n-nodes-base.set",
      typeVersion: 3.5,
      parameters: safeTransformParameters,
    },
  ];
  for (const e of expected) {
    const n = w.nodes.find((node) => node.name === e.name);
    if (
      !n ||
      n.type !== e.type ||
      n.typeVersion !== e.typeVersion ||
      n.disabled ||
      n.retryOnFail ||
      n.executeOnce ||
      n.continueOnFail ||
      n.onError ||
      (n.credentials && Object.keys(n.credentials as object).length) ||
      canonicalJson(n.parameters) !== canonicalJson(e.parameters)
    )
      throw new IntegrationError("malformed");
  }
}
function firstJson(data: unknown, node: string): unknown {
  // Official get-execution.tool.ts: data is IRunExecutionData; only selected node output is requested.
  const parsed = z
    .object({
      resultData: z.object({
        runData: z.record(
          z.string(),
          z.array(
            z.object({
              data: z
                .object({
                  main: z.array(
                    z.array(z.object({ json: z.unknown() })).nullable(),
                  ),
                })
                .optional(),
            }),
          ),
        ),
      }),
    })
    .safeParse(data);
  return parsed.success
    ? parsed.data.resultData.runData[node]?.[0]?.data?.main[0]?.[0]?.json
    : undefined;
}
export class N8nClient implements AutomationAdapter {
  constructor(
    private config: N8nConfig,
    private tools: N8nToolCaller = new N8nTransport(config),
  ) {}
  workflowUrl(value: string) {
    return `${this.config.origin}/workflow/${encodeURIComponent(id.parse(value))}`;
  }
  executionUrl(workflowId: string, value: string) {
    return `${this.workflowUrl(workflowId)}/executions/${encodeURIComponent(id.parse(value))}`;
  }
  async listWorkflows() {
    const raw = await this.tools.call("search_workflows", { limit: 200 });
    const parsed = z
      .object({
        data: z
          .array(
            z.object({
              id,
              name: z.string().nullable(),
              description: z.string().nullable().optional(),
              active: z.boolean().nullable(),
              availableInMCP: z.boolean(),
            }),
          )
          .max(200),
        count: z.number(),
      })
      .safeParse(raw);
    if (!parsed.success) throw new IntegrationError("malformed");
    const workflows: CatalogWorkflow[] = parsed.data.data.map((w) => ({
      id: w.id,
      name: (w.name ?? "Be pavadinimo").slice(0, 160),
      description: w.description?.slice(0, 500) ?? null,
      active: w.active,
      availableInMCP: w.availableInMCP,
      eligible: false,
      reason: "not_eligible",
      versionId: null,
      workflowUrl: this.workflowUrl(w.id),
    }));
    return { workflows, truncated: parsed.data.count > workflows.length };
  }
  async verifyContract(contract: AutomationContract) {
    verifySafeDefinition(
      await this.tools.call("get_workflow_details", {
        workflowId: contract.workflowId,
        detailLevel: "full",
      }),
      contract,
    );
  }
  async execute(contract: AutomationContract, requestId: string, text: string) {
    if (!this.config.enabled) throw new IntegrationError("disabled");
    if (
      !this.config.contract ||
      contract.workflowId !== this.config.contract.workflowId ||
      contract.versionId !== this.config.contract.versionId ||
      contract.key !== this.config.contract.key
    )
      throw new IntegrationError("configuration");
    const raw = await this.tools.call(
      "execute_workflow",
      {
        workflowId: contract.workflowId,
        executionMode: "manual",
        triggerNodeName: "Synthetic input",
        inputs: { webhookData: { method: "POST", body: { requestId, text } } },
      },
      true,
    );
    const parsed = z
      .object({
        executionId: id.nullable(),
        status: z.enum(["started", "error"]),
      })
      .safeParse(raw);
    if (
      !parsed.success ||
      (!parsed.data.executionId && parsed.data.status === "started")
    )
      throw new IntegrationError("malformed", true);
    return {
      id: parsed.data.executionId,
      rejected: !parsed.data.executionId && parsed.data.status === "error",
    };
  }
  async readExecution(
    workflowId: string,
    value: string,
    data = false,
  ): Promise<AutomationExecution> {
    const raw = await this.tools.call("get_workflow_execution", {
      workflowId: id.parse(workflowId),
      executionId: id.parse(value),
      includeData: data,
      ...(data
        ? { nodeNames: ["Synthetic input", "Transform text"], truncateData: 1 }
        : {}),
    });
    const parsed = z
      .object({
        execution: z.object({
          id,
          workflowId: id,
          status: z.string().max(64),
          mode: z.string().max(64),
          startedAt: date,
          stoppedAt: date,
          waitTill: date.optional(),
        }),
        data: z.unknown().optional(),
      })
      .safeParse(raw);
    if (
      !parsed.success ||
      parsed.data.execution.id !== value ||
      parsed.data.execution.workflowId !== workflowId
    )
      throw new IntegrationError("malformed");
    const correlation = z
      .object({
        body: z
          .object({ requestId: z.uuid(), text: z.string().max(240) })
          .strict(),
      })
      .safeParse(firstJson(parsed.data.data, "Synthetic input"));
    const result = z
      .object({ requestId: z.uuid(), transformedText: z.string().max(1000) })
      .strict()
      .safeParse(firstJson(parsed.data.data, "Transform text"));
    return {
      ...parsed.data.execution,
      waitTill: parsed.data.execution.waitTill ?? null,
      correlation: correlation.success ? correlation.data.body : null,
      result: result.success ? result.data : null,
    };
  }
  async findExecutions(workflowId: string, startedAfter: string) {
    const raw = await this.tools.call("search_workflow_executions", {
      workflowId,
      startedAfter,
      limit: 5,
    });
    const parsed = z
      .object({
        data: z
          .array(z.object({ id, workflowId: id, mode: z.string() }))
          .max(5),
        nextCursor: z.string().nullable(),
      })
      .safeParse(raw);
    if (
      !parsed.success ||
      parsed.data.data.some((e) => e.workflowId !== workflowId)
    )
      throw new IntegrationError("malformed");
    return {
      ids: parsed.data.data.filter((e) => e.mode === "manual").map((e) => e.id),
      complete: parsed.data.nextCursor === null,
    };
  }
}
