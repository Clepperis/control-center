import { describe, it, expect } from "vitest";
import { analyzeTask } from "../src/server/models/analysis";
import { NexosGateway } from "../src/integrations/nexos";
import type { Fetcher } from "../src/integrations/errors";

describe("task analysis for automatic model choice", () => {
  it.each([
    ["Labas, kaip sekasi?", "fast", "short"],
    ["Ačiū!", "fast", "short"],
    [
      "Kodėl meta klaidą?\n```ts\nconst x: number = 'a';\n```",
      "standard",
      "code",
    ],
    [
      "TypeError: Cannot read properties of undefined at src/app/page.tsx:12",
      "standard",
      "code",
    ],
    [
      "Suplanuok architektūrą naujam n8n integracijos moduliui",
      "strong",
      "planning",
    ],
    ["Palygink tris variantus ir rekomenduok strategiją", "strong", "planning"],
    ["Design a migration strategy for the database", "strong", "planning"],
  ] as const)("%s -> %s (%s)", (text, tier, reason) => {
    expect(analyzeTask(text, false)).toEqual({ tier, reason });
  });

  it("treats long messages as standard work", () => {
    expect(analyzeTask("Aprašymas. ".repeat(200), false)).toEqual({
      tier: "standard",
      reason: "long",
    });
  });

  it("uses at least the standard tier for knowledge questions", () => {
    expect(analyzeTask("Kas yra projekte?", true)).toEqual({
      tier: "standard",
      reason: "knowledge",
    });
  });

  it("keeps planning above the knowledge minimum", () => {
    expect(analyzeTask("Suplanuok strategiją pagal žinias", true)).toEqual({
      tier: "strong",
      reason: "planning",
    });
  });

  it("falls back to fast for ordinary medium text", () => {
    expect(
      analyzeTask(
        "Parašyk trumpą laišką klientui apie vėluojantį užsakymą.",
        false,
      ),
    ).toEqual({ tier: "fast", reason: "default" });
  });
});

const routes = { fast: "m-fast", standard: "m-standard", strong: "m-strong" };
function gateway() {
  const bodies: Record<string, unknown>[] = [];
  const fetcher: Fetcher = async (url, init) => {
    if (String(url).endsWith("/models"))
      return Response.json({
        data: Object.values(routes).map((id) => ({
          id,
          endpoints: ["chat_completion"],
        })),
      });
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
  const g = new NexosGateway(
    {
      apiKey: "synthetic",
      model: "m-standard",
      routes,
      timeoutMs: 1000,
      maxTokens: 1200,
      enabled: true,
    },
    fetcher,
  );
  return { g, bodies };
}

describe("gateway applies the analysis in automatic mode", () => {
  it("routes planning to the strong tier and records the reason", async () => {
    const { g, bodies } = gateway();
    const result = await g.complete(
      [{ role: "user", content: "Suplanuok architektūrą naujam moduliui" }],
      [],
    );
    expect(bodies[0].model).toBe("m-strong");
    expect(result.route).toMatchObject({
      tier: "strong",
      override: false,
      reason: "planning",
    });
  });

  it("keeps short chat on the fast tier", async () => {
    const { g, bodies } = gateway();
    await g.complete([{ role: "user", content: "Labas" }], []);
    expect(bodies[0].model).toBe("m-fast");
  });

  it("lets the owner's explicit tier win over the analysis", async () => {
    const { g, bodies } = gateway();
    const result = await g.complete(
      [{ role: "user", content: "Suplanuok architektūrą" }],
      [],
      undefined,
      [],
      undefined,
      { tier: "fast" },
    );
    expect(bodies[0].model).toBe("m-fast");
    expect(result.route).toMatchObject({ override: true, reason: "owner" });
  });

  it("analyzes the latest user message, not older turns", async () => {
    const { g, bodies } = gateway();
    await g.complete(
      [
        { role: "user", content: "Suplanuok architektūrą" },
        { role: "assistant", content: "Štai planas." },
        { role: "user", content: "Ačiū" },
      ],
      [],
    );
    expect(bodies[0].model).toBe("m-fast");
  });
});
