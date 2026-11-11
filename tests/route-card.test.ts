import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { chooseModel } from "../src/server/models/routing";
import { NexosGateway, type PlanningGateway } from "../src/integrations/nexos";
import { OrchestrationService } from "../src/server/orchestration/service";
import { Store } from "../src/server/orchestration/store";
import { migrate } from "../src/server/db/migrate";
import type { Database } from "../src/server/db/types";
import type { DelegationAdapter } from "../src/integrations/paperclip";
import type { Fetcher } from "../src/integrations/errors";
import { openTestDatabase } from "./pglite";

const routes = { fast: "m-fast", standard: "m-standard", strong: "m-strong" };
const all = (ids: string[]) => (id: string) => ids.includes(id);

describe("owner tier override", () => {
  it("lets the owner pick a stronger tier explicitly and marks it", () => {
    expect(
      chooseModel("d", routes, "chat", all(Object.values(routes)), "strong"),
    ).toMatchObject({
      tier: "strong",
      requestedTier: "strong",
      model: "m-strong",
      fallback: false,
      override: true,
    });
  });

  it("lets the owner pick a cheaper tier for heavy tasks", () => {
    expect(
      chooseModel(
        "d",
        routes,
        "improvement",
        all(Object.values(routes)),
        "fast",
      ),
    ).toMatchObject({ tier: "fast", model: "m-fast", override: true });
  });

  it("still falls back only to cheaper tiers under an override", () => {
    expect(
      chooseModel("d", routes, "chat", all(["m-fast"]), "strong"),
    ).toMatchObject({ tier: "fast", fallback: true, override: true });
  });

  it("reports no override for the automatic choice", () => {
    expect(
      chooseModel("d", routes, "chat", all(Object.values(routes))),
    ).toMatchObject({ override: false });
  });
});

describe("gateway honours the requested tier", () => {
  it("sends the overridden tier model", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetcher: Fetcher = async (url, init) => {
      if (String(url).endsWith("/models"))
        return Response.json({
          data: Object.values(routes).map((id) => ({ id })),
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
    const result = await new NexosGateway(
      {
        apiKey: "synthetic",
        model: "d",
        routes,
        timeoutMs: 1000,
        maxTokens: 1200,
        enabled: true,
      },
      fetcher,
    ).complete(
      [{ role: "user", content: "Labas" }],
      [],
      undefined,
      [],
      undefined,
      { tier: "strong" },
    );
    expect(bodies[0].model).toBe("m-strong");
    expect(result.route).toMatchObject({ tier: "strong", override: true });
  });
});

describe("chat persists the route summary", () => {
  let db: Database;
  let requested: unknown;
  let service: OrchestrationService;
  const unavailable = async () => {
    throw new Error("unused");
  };
  const paperclip: DelegationAdapter = {
    listAgents: async () => [],
    createTask: unavailable,
    readTask: unavailable,
    findByMarker: unavailable,
    taskUrl: () => "",
  };
  beforeEach(async () => {
    db = await openTestDatabase();
    await migrate(db, resolve("db/migrations"));
    const gateway: PlanningGateway = {
      async complete(_m, _a, _s, _au, _g, options) {
        requested = options?.tier ?? null;
        return {
          reply: { kind: "answer", reply: "Sintetinis atsakymas." },
          usage: { totalTokens: 11, credits: 0.5 },
          route: {
            task: "chat",
            tier: "strong",
            requestedTier: "strong",
            model: "m-strong",
            fallback: false,
            override: true,
          },
        };
      },
    };
    service = new OrchestrationService(
      new Store(db),
      gateway,
      paperclip,
      false,
    );
  });
  afterEach(async () => {
    await db.close();
  });

  it("passes the owner's tier to the gateway and stores kind, model and override", async () => {
    const conversationId = randomUUID();
    const snapshot = await service.submit(
      "owner",
      conversationId,
      randomUUID(),
      "Sintetinis klausimas",
      undefined,
      null,
      { tier: "strong" },
    );
    expect(requested).toBe("strong");
    expect(snapshot.messages[1].usage).toEqual({
      totalTokens: 11,
      credits: 0.5,
      model: "m-strong",
      tier: "strong",
      fallback: false,
      override: true,
      replyKind: "answer",
    });
  });

  it("defaults to automatic routing", async () => {
    await service.submit("owner", randomUUID(), randomUUID(), "Klausimas");
    expect(requested).toBeNull();
  });
});
