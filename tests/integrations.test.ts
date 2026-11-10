import { describe, it, expect, vi } from "vitest";
import { NexosGateway } from "../src/integrations/nexos";
import { PaperclipClient } from "../src/integrations/paperclip";
import { IntegrationError, requestJson } from "../src/integrations/errors";
import { textContract } from "../src/domain/automations";
import {
  gatewayConfig,
  paperclipConfig,
  requireLiveMode,
} from "../src/server/config";
const id = "22222222-2222-4222-8222-222222222222";
const company = "11111111-1111-4111-8111-111111111111";
const config = {
  apiKey: "synthetic-not-a-real-key",
  model: "synthetic-model",
  timeoutMs: 1000,
  maxTokens: 1200,
  enabled: true,
};
const pcConfig = {
  baseUrl: "https://paperclip.example",
  apiKey: "pcp_board_synthetic",
  companyId: company,
  agentIds: [id],
  enabled: true,
  contractVerified: true,
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
describe("nexos documented transport with deterministic HTTP substitutes", () => {
  it.each([false, true])(
    "accepts an automation proposal only with a server-approved offer (%s), without exposing native IDs",
    async (approved) => {
      const automation = textContract(
        "private-native-workflow",
        "11111111-1111-4111-8111-111111111111",
      );
      const f = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({ data: [{ id: config.model }] }))
        .mockResolvedValueOnce(
          json({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    kind: "automation",
                    reply: "Siūlau patikrai.",
                    automation: {
                      key: automation.key,
                      input: { text: "labas" },
                    },
                  }),
                },
              },
            ],
          }),
        );
      const call = new NexosGateway(config, f).complete(
        [{ role: "user", content: "Synthetic automation request" }],
        [],
        undefined,
        approved ? [automation] : [],
      );
      if (approved)
        await expect(call).resolves.toMatchObject({
          reply: { kind: "automation" },
        });
      else await expect(call).rejects.toMatchObject({ code: "malformed" });
      expect(f.mock.calls[1][1]?.body).not.toContain("private-native-workflow");
    },
  );
  it("uses only the fixed gateway and configured model, bounds output and normalizes actual optional usage", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: [{ id: config.model }] }))
      .mockResolvedValueOnce(
        json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  kind: "answer",
                  reply: "Sintetinis atsakymas.",
                }),
              },
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
        }),
      );
    const result = await new NexosGateway(config, f).complete(
      [{ role: "user", content: "Sintetinis klausimas" }],
      [],
    );
    expect(result.usage).toEqual({
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
      credits: undefined,
    });
    expect(f.mock.calls[1][0]).toBe("https://api.nexos.ai/v1/chat/completions");
    expect(JSON.parse(f.mock.calls[1][1]!.body as string)).toMatchObject({
      model: "synthetic-model",
      stream: false,
      max_completion_tokens: 1200,
      n: 1,
      store: false,
    });
    expect(f.mock.calls[1][1]?.redirect).toBe("error");
  });
  it.each([401, 403, 429, 400, 500])(
    "normalizes HTTP %s without exposing provider bodies",
    async (status) => {
      const f = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ error: "PRIVATE_PROVIDER_DETAILS" }, status));
      await expect(
        new NexosGateway(config, f).complete(
          [{ role: "user", content: "Sintetinis klausimas" }],
          [],
        ),
      ).rejects.toMatchObject({
        code:
          status === 401 || status === 403
            ? "authentication"
            : status === 429
              ? "rate_limit"
              : "provider",
      });
    },
  );
  it("rejects unavailable configuration, unlisted models, malformed JSON, truncation and forged agent IDs", async () => {
    expect(() => gatewayConfig({})).toThrow(IntegrationError);
    expect(() => paperclipConfig({})).toThrow(IntegrationError);
    expect(() => requireLiveMode({ DATA_MODE: "demo" })).toThrow(
      IntegrationError,
    );
    const disabled = vi.fn<typeof fetch>();
    await expect(
      new NexosGateway({ ...config, enabled: false }, disabled).complete(
        [{ role: "user", content: "Test" }],
        [],
      ),
    ).rejects.toMatchObject({ code: "disabled" });
    expect(disabled).not.toHaveBeenCalled();
    const unavailable = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ data: [] }));
    await expect(
      new NexosGateway(config, unavailable).complete(
        [{ role: "user", content: "Test" }],
        [],
      ),
    ).rejects.toMatchObject({ code: "configuration" });
    expect(unavailable).toHaveBeenCalledTimes(1);
    for (const completion of [
      {
        choices: [{ finish_reason: "stop", message: { content: "not JSON" } }],
      },
      {
        choices: [
          {
            finish_reason: "length",
            message: { content: '{"kind":"answer","reply":"test"}' },
          },
        ],
      },
      {
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                kind: "plan",
                reply: "Test",
                plan: {
                  objective: "Test",
                  title: "Test",
                  boundedTask: "Test",
                  agentId: id,
                  completionCriteria: ["Test"],
                  constraints: [],
                },
              }),
            },
          },
        ],
      },
    ]) {
      const f = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({ data: [{ id: config.model }] }))
        .mockResolvedValueOnce(json(completion));
      await expect(
        new NexosGateway(config, f).complete(
          [{ role: "user", content: "Test" }],
          [],
        ),
      ).rejects.toMatchObject({ code: "malformed" });
    }
  });
  it("honors timeout and caller cancellation without retrying", async () => {
    const hanging: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        ),
      );
    await expect(
      requestJson(hanging, "https://synthetic.example", {}, { timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "timeout" });
    const controller = new AbortController();
    const promise = requestJson(
      hanging,
      "https://synthetic.example",
      {},
      { timeoutMs: 1000, signal: controller.signal, mutation: true },
    );
    controller.abort();
    await expect(promise).rejects.toMatchObject({
      code: "cancelled",
      uncertain: true,
    });
  });
});
describe("Paperclip operator boundary", () => {
  it("requires contract verification and operator scope before reporting eligible agents", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ companyIds: [company] }))
      .mockResolvedValueOnce(
        json([
          {
            id,
            companyId: company,
            name: "Synthetic",
            role: "general",
            status: "idle",
            lifecycleState: "ready",
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            companyId: company,
            name: "Paused",
            role: "general",
            status: "paused",
            lifecycleState: "paused",
          },
        ]),
      );
    const client = new PaperclipClient(pcConfig, f);
    expect((await client.listAgents()).map((a) => a.eligible)).toEqual([
      true,
      false,
    ]);
    const blocked = vi.fn<typeof fetch>();
    await expect(
      new PaperclipClient(
        { ...pcConfig, contractVerified: false },
        blocked,
      ).listAgents(),
    ).rejects.toMatchObject({ code: "configuration" });
    expect(blocked).not.toHaveBeenCalled();
  });
  it("does not infer readiness from an idle label when lifecycle evidence is missing", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ companyIds: [company] }))
      .mockResolvedValueOnce(
        json([
          {
            id,
            companyId: company,
            name: "Unknown",
            role: "general",
            status: "idle",
          },
        ]),
      );
    expect(
      (await new PaperclipClient(pcConfig, f).listAgents())[0].eligible,
    ).toBe(false);
  });
  it("never accepts another company and treats malformed creation responses as uncertain", async () => {
    const wrong = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ companyIds: ["different"] }));
    await expect(
      new PaperclipClient(pcConfig, wrong).listAgents(),
    ).rejects.toMatchObject({ code: "authentication" });
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ accepted: true }));
    await expect(
      new PaperclipClient(pcConfig, malformed).createTask({
        title: "Test",
        description: "Synthetic",
        agentId: id,
      }),
    ).rejects.toMatchObject({ code: "malformed", uncertain: true });
    expect(malformed).toHaveBeenCalledTimes(1);
    expect(new PaperclipClient(pcConfig).taskUrl("SYN-12")).toBe(
      "https://paperclip.example/SYN/issues/SYN-12",
    );
    expect(new PaperclipClient(pcConfig).taskUrl("javascript:bad")).toBe("");
  });
});
