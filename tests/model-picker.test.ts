import { describe, it, expect } from "vitest";
import { NexosGateway } from "../src/integrations/nexos";
import type { Fetcher } from "../src/integrations/errors";

const catalog = [
  {
    id: "Claude Sonnet 5.5",
    developer: "Anthropic",
    endpoints: ["chat_completion", "messages"],
  },
  {
    id: "Claude Haiku 5.5",
    developer: "Anthropic",
    endpoints: ["chat_completion"],
  },
  { id: "GPT 6.1 Sol", developer: "OpenAI", endpoints: ["chat_completion"] },
  { id: "GPT Image 2", developer: "OpenAI", endpoints: ["image_generation"] },
  { id: "Whisper 1", developer: "OpenAI", endpoints: ["transcription"] },
  { id: "Legacy without endpoints", developer: "Other" },
];
const config = {
  apiKey: "synthetic",
  model: "Claude Sonnet 5.5",
  routes: { fast: "Claude Haiku 5.5" },
  timeoutMs: 1000,
  maxTokens: 1200,
  enabled: true,
};
function gateway() {
  const bodies: Record<string, unknown>[] = [];
  const fetcher: Fetcher = async (url, init) => {
    if (String(url).endsWith("/models"))
      return Response.json({ data: catalog });
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({ kind: "answer", reply: "Gerai." }),
          },
        },
      ],
    });
  };
  return { g: new NexosGateway(config, fetcher), bodies };
}

describe("chat model catalog", () => {
  it("lists only chat-capable models, grouped by developer then name", async () => {
    expect(await gateway().g.chatModels()).toEqual([
      { id: "Claude Haiku 5.5", developer: "Anthropic" },
      { id: "Claude Sonnet 5.5", developer: "Anthropic" },
      { id: "GPT 6.1 Sol", developer: "OpenAI" },
    ]);
  });
});

describe("explicit owner model choice", () => {
  it("uses the exact chosen chat model and marks it as the owner's choice", async () => {
    const { g, bodies } = gateway();
    const result = await g.complete(
      [{ role: "user", content: "Labas" }],
      [],
      undefined,
      [],
      undefined,
      { model: "GPT 6.1 Sol" },
    );
    expect(bodies[0].model).toBe("GPT 6.1 Sol");
    expect(result.route).toMatchObject({
      model: "GPT 6.1 Sol",
      tier: null,
      override: true,
      fallback: false,
    });
  });

  it.each(["GPT Image 2", "Not in catalog"])(
    "refuses %s instead of substituting another model",
    async (model) => {
      const { g, bodies } = gateway();
      await expect(
        g.complete(
          [{ role: "user", content: "Labas" }],
          [],
          undefined,
          [],
          undefined,
          { model },
        ),
      ).rejects.toMatchObject({ code: "configuration" });
      expect(bodies).toHaveLength(0);
    },
  );

  it("rejects choosing both a tier and a model", async () => {
    const { g } = gateway();
    await expect(
      g.complete(
        [{ role: "user", content: "Labas" }],
        [],
        undefined,
        [],
        undefined,
        {
          tier: "fast",
          model: "GPT 6.1 Sol",
        },
      ),
    ).rejects.toMatchObject({ code: "malformed" });
  });
});
