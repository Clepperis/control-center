import { describe, expect, it, vi } from "vitest";
import {
  N8nClient,
  N8nTransport,
  verifySafeDefinition,
  type N8nToolCaller,
} from "../src/integrations/n8n";
import { n8nConfig } from "../src/server/config";
import { automationInputSchema } from "../src/domain/automations";
import { IntegrationError } from "../src/integrations/errors";

import { contract, config, definition } from "./automation-fixtures";
import { n8nHttpFixture } from "./n8n-http-fixture";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
describe("n8n official MCP transport with deterministic HTTP substitutes", () => {
  it("uses only the configured endpoint and bearer credential, completes legacy handshake and parses tool output", async () => {
    const f = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("https://n8n.example/mcp-server/http");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer synthetic-application-token",
      );
      expect(init?.redirect).toBe("error");
      if (init?.method === "GET") return new Response(null, { status: 405 });
      const b = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      if (b?.method === "initialize")
        return json({
          jsonrpc: "2.0",
          id: b.id,
          result: {
            protocolVersion: "2025-11-25",
            capabilities: { tools: {} },
            serverInfo: { name: "synthetic-n8n", version: "test" },
          },
        });
      if (b?.method === "notifications/initialized")
        return new Response(null, { status: 202 });
      return json({
        jsonrpc: "2.0",
        id: b.id,
        result: {
          content: [
            { type: "text", text: JSON.stringify({ data: [], count: 0 }) },
          ],
        },
      });
    });
    await expect(
      new N8nTransport(config, f).call("search_workflows", { limit: 200 }),
    ).resolves.toEqual({ data: [], count: 0 });
    expect(
      f.mock.calls.filter(
        ([, i]) =>
          typeof i?.body === "string" &&
          JSON.parse(i.body).method === "tools/call",
      ),
    ).toHaveLength(1);
  });
  it.each([401, 403, 429])(
    "maps HTTP %s without leaking response bodies or retrying denied reads",
    async (status) => {
      const f = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ secret: "never expose this" }, status));
      await expect(
        new N8nTransport(config, f).call("search_workflows", {}),
      ).rejects.toMatchObject({
        code: status === 429 ? "rate_limit" : "authentication",
      });
      expect(f).toHaveBeenCalledTimes(1);
    },
  );
  it("bounds safe read retries and never retries an ambiguous execution POST", async () => {
    const read = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private provider details"));
    await expect(
      new N8nTransport(config, read).call("search_workflows", {}),
    ).rejects.toMatchObject({ code: "provider" });
    expect(read).toHaveBeenCalledTimes(2);
    let submissions = 0;
    const f = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === "GET") return new Response(null, { status: 405 });
      const b = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      if (b?.method === "initialize")
        return json({
          jsonrpc: "2.0",
          id: b.id,
          result: {
            protocolVersion: "2025-11-25",
            capabilities: { tools: {} },
            serverInfo: { name: "synthetic", version: "test" },
          },
        });
      if (b?.method === "notifications/initialized")
        return new Response(null, { status: 202 });
      submissions++;
      throw new Error("Connection lost after server may have accepted");
    });
    await expect(
      new N8nTransport(config, f).call("execute_workflow", {}, true),
    ).rejects.toMatchObject({ uncertain: true });
    expect(submissions).toBe(1);
  });
});
describe("n8n curated contract and payloads", () => {
  it("bounds oversized MCP execution data and refuses out-of-surface tools and misclassified mutation calls", async () => {
    const f = n8nHttpFixture();
    f.executions.set("oversized", {
      requestId: "22222222-2222-4222-8222-222222222222",
      text: "x".repeat(1_000_001),
      status: "success",
    });
    const transport = new N8nTransport(config, f.fetcher);
    await expect(
      new N8nClient(config, transport).readExecution(
        contract.workflowId,
        "oversized",
        true,
      ),
    ).rejects.toBeInstanceOf(IntegrationError);
    await expect(transport.call("publish_workflow", {})).rejects.toMatchObject({
      code: "configuration",
    });
    await expect(transport.call("execute_workflow", {})).rejects.toMatchObject({
      code: "configuration",
    });
  });
  it("rejects missing, invalid and non-origin configuration and unsupported input fields", () => {
    for (const env of [
      {},
      { N8N_ORIGIN: "http://n8n.example", N8N_MCP_TOKEN: config.token },
      { N8N_ORIGIN: "https://n8n.example/path", N8N_MCP_TOKEN: config.token },
      { N8N_ORIGIN: config.origin, N8N_MCP_TOKEN: "bad\nheader" },
      {
        N8N_ORIGIN: config.origin,
        N8N_MCP_TOKEN: config.token,
        N8N_TEXT_WORKFLOW_ID: "only-one-field",
      },
    ])
      expect(() => n8nConfig(env)).toThrow();
    expect(
      n8nConfig({ N8N_ORIGIN: config.origin, N8N_MCP_TOKEN: config.token }),
    ).toMatchObject({ enabled: false, contract: null });
    expect(() =>
      automationInputSchema.parse({
        text: "hello",
        url: "https://other.example",
      }),
    ).toThrow();
    expect(() =>
      automationInputSchema.parse({ text: "x".repeat(241) }),
    ).toThrow();
    expect(() => automationInputSchema.parse({ text: "   " })).toThrow();
  });
  it("checks the pinned version, two exact built-ins, graph, parameters and credential absence", () => {
    verifySafeDefinition(definition(), contract);
    for (const mutate of [
      (d: ReturnType<typeof definition>) => {
        d.workflow.versionId = "changed";
      },
      (d: ReturnType<typeof definition>) => {
        d.workflow.active = true;
      },
      (d: ReturnType<typeof definition>) => {
        d.workflow.nodes[1].type = "n8n-nodes-base.httpRequest";
      },
      (d: ReturnType<typeof definition>) => {
        Object.assign(d.workflow.nodes[0], {
          credentials: { headerAuth: { id: "not-allowed" } },
        });
      },
      (d: ReturnType<typeof definition>) => {
        Object.assign(d.workflow.nodes[1], { parameters: {} });
      },
    ]) {
      const d = definition();
      mutate(d);
      expect(() => verifySafeDefinition(d, contract)).toThrow();
    }
  });
  it("uses the documented tool arguments; projects only bounded selected-node results and matching execution identity", async () => {
    const correlation = "22222222-2222-4222-8222-222222222222";
    const call = vi
      .fn<N8nToolCaller["call"]>()
      .mockResolvedValueOnce({ executionId: "123", status: "started" })
      .mockResolvedValueOnce({
        execution: {
          id: "123",
          workflowId: contract.workflowId,
          status: "success",
          mode: "manual",
          startedAt: null,
          stoppedAt: null,
        },
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
                            body: { requestId: correlation, text: "labas" },
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
                            requestId: correlation,
                            transformedText: "LABAS",
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
      });
    const c = new N8nClient(config, { call });
    expect(await c.execute(contract, correlation, "labas")).toEqual({
      id: "123",
      rejected: false,
    });
    expect(call.mock.calls[0]).toEqual([
      "execute_workflow",
      {
        workflowId: contract.workflowId,
        executionMode: "manual",
        triggerNodeName: "Synthetic input",
        inputs: {
          webhookData: {
            method: "POST",
            body: { requestId: correlation, text: "labas" },
          },
        },
      },
      true,
    ]);
    expect(
      await c.readExecution(contract.workflowId, "123", true),
    ).toMatchObject({
      correlation: { requestId: correlation, text: "labas" },
      result: { transformedText: "LABAS" },
    });
    expect(call.mock.calls[1][1]).toMatchObject({
      includeData: true,
      nodeNames: ["Synthetic input", "Transform text"],
      truncateData: 1,
    });
    call.mockResolvedValueOnce({
      execution: {
        id: "different",
        workflowId: contract.workflowId,
        status: "success",
        mode: "manual",
        startedAt: null,
        stoppedAt: null,
      },
    });
    await expect(
      c.readExecution(contract.workflowId, "123"),
    ).rejects.toMatchObject({ code: "malformed" });
    call.mockResolvedValueOnce({ executionId: null, status: "started" });
    await expect(
      c.execute(contract, correlation, "labas"),
    ).rejects.toMatchObject({ uncertain: true });
  });
  it("rejects malformed discovery, disabled execution and unsafe links", async () => {
    const c = new N8nClient(
      { ...config, enabled: false },
      { call: async () => ({ data: [{ id: "bad/id" }], count: 1 }) },
    );
    await expect(c.listWorkflows()).rejects.toBeInstanceOf(IntegrationError);
    await expect(c.execute(contract, "id", "x")).rejects.toMatchObject({
      code: "disabled",
    });
    expect(() => c.workflowUrl("../other")).toThrow();
  });
});
