import { describe, it, expect } from "vitest";
import { chooseModel, TASK_TIER } from "../src/server/models/routing";
import { gatewayConfig } from "../src/server/config";
import { NexosGateway } from "../src/integrations/nexos";
import { NexosPlatformPlanner } from "../src/server/improvements/planner";
import type { Fetcher } from "../src/integrations/errors";
import type { Improvement } from "../src/domain/improvements";
import type { UsageEntry, UsageSink } from "../src/server/observability/usage";

const all = (ids: string[]) => (id: string) => ids.includes(id);
const routes = { fast: "m-fast", standard: "m-standard", strong: "m-strong" };

describe("deterministic model routing", () => {
  it("maps task types to fixed tiers", () => {
    expect(TASK_TIER).toEqual({
      chat: "fast",
      knowledge: "standard",
      improvement: "strong",
    });
  });

  it("uses the single default model for every task when no tiers are configured", () => {
    for (const task of ["chat", "knowledge", "improvement"] as const)
      expect(chooseModel("m-default", {}, task, all(["m-default"]))).toEqual({
        task,
        tier: TASK_TIER[task],
        requestedTier: TASK_TIER[task],
        model: "m-default",
        fallback: false,
        override: false,
      });
  });

  it("selects the configured model for each tier", () => {
    const ok = all(Object.values(routes));
    expect(chooseModel("d", routes, "chat", ok)?.model).toBe("m-fast");
    expect(chooseModel("d", routes, "knowledge", ok)?.model).toBe("m-standard");
    expect(chooseModel("d", routes, "improvement", ok)?.model).toBe("m-strong");
  });

  it("falls back only to a cheaper tier and marks the fallback", () => {
    expect(
      chooseModel("d", routes, "improvement", all(["m-fast", "m-standard"])),
    ).toEqual({
      task: "improvement",
      tier: "standard",
      requestedTier: "strong",
      model: "m-standard",
      fallback: true,
      override: false,
    });
  });

  it("never upgrades to a more expensive tier", () => {
    expect(
      chooseModel("d", routes, "chat", all(["m-standard", "m-strong"])),
    ).toBeNull();
  });

  it("returns null when no candidate exists in the catalog", () => {
    expect(chooseModel("d", {}, "knowledge", all([]))).toBeNull();
  });
});

describe("tier configuration", () => {
  const base = { NEXOS_API_KEY: "synthetic", NEXOS_MODEL: "m-default" };
  it("reads optional tier models and treats empty values as unset", () => {
    expect(
      gatewayConfig({
        ...base,
        NEXOS_MODEL_FAST: "m-fast",
        NEXOS_MODEL_STANDARD: "",
        NEXOS_MODEL_STRONG: "  ",
      }).routes,
    ).toEqual({ fast: "m-fast" });
  });
  it("keeps working with only NEXOS_MODEL", () => {
    expect(gatewayConfig(base).routes).toEqual({});
  });
});

const config = {
  apiKey: "synthetic-not-a-real-key",
  model: "m-default",
  routes,
  timeoutMs: 1000,
  maxTokens: 1200,
  enabled: true,
};
function recording(catalog: string[], content: unknown) {
  const bodies: Record<string, unknown>[] = [];
  const fetcher: Fetcher = async (url, init) => {
    if (String(url).endsWith("/models"))
      return Response.json({ data: catalog.map((id) => ({ id })) });
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(content) },
        },
      ],
      usage: { total_tokens: 9 },
    });
  };
  const entries: UsageEntry[] = [];
  const sink: UsageSink = {
    async record(e) {
      entries.push(e);
    },
  };
  return { bodies, fetcher, entries, sink };
}
const answer = { kind: "answer", reply: "Sintetinis atsakymas." };

describe("gateway and planner use the routed model", () => {
  it("sends chat to the fast model and reports the route", async () => {
    const r = recording(Object.values(routes), answer);
    const result = await new NexosGateway(config, r.fetcher, r.sink).complete(
      [{ role: "user", content: "Labas" }],
      [],
    );
    expect(r.bodies[0].model).toBe("m-fast");
    expect(r.entries[0].model).toBe("m-fast");
    expect(result.route).toMatchObject({
      tier: "fast",
      model: "m-fast",
      fallback: false,
    });
  });

  it("sends grounded questions to the standard model", async () => {
    const r = recording(Object.values(routes), answer);
    await new NexosGateway(config, r.fetcher, r.sink).complete(
      [{ role: "user", content: "Klausimas" }],
      [],
      undefined,
      [],
      { status: "empty", scope: null, passages: [], cited: [] },
    );
    expect(r.bodies[0].model).toBe("m-standard");
  });

  it("refuses with configuration when the required tier and cheaper tiers are missing", async () => {
    const r = recording(["m-strong"], answer);
    await expect(
      new NexosGateway(config, r.fetcher, r.sink).complete(
        [{ role: "user", content: "Labas" }],
        [],
      ),
    ).rejects.toMatchObject({ code: "configuration" });
    expect(r.bodies).toHaveLength(0);
    expect(r.entries).toHaveLength(0);
  });

  it("routes Platform Engineer work to the strong tier with visible fallback", async () => {
    const r = recording(["m-fast", "m-standard"], {
      reply: "Aptarkime.",
      plan: null,
    });
    const request = {
      messages: [{ role: "user", text: "Aptarkime" }],
      plan: null,
      state: "discussing",
      external: null,
      error: null,
      candidate: null,
    } as unknown as Improvement;
    await new NexosPlatformPlanner(config, r.fetcher, r.sink).respond(
      request,
      null,
      [],
      false,
    );
    expect(r.bodies[0].model).toBe("m-standard");
    expect(r.entries[0]).toMatchObject({
      source: "improvement",
      model: "m-standard",
    });
  });
});
