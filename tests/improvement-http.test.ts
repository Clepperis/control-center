import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { openTestDatabase } from "./pglite";
import { migrate } from "../src/server/db/migrate";
import { ImprovementService } from "../src/server/improvements/service";
import { improvementFixture } from "./improvement-fixtures";
import type { Database } from "../src/server/db/types";
import { GET, POST } from "../src/app/api/improvements/route";
const context = vi.hoisted(() => ({
  owner: "synthetic-http-owner",
  service: null as ImprovementService | null,
}));
vi.mock("../src/server/auth/session", () => ({
  requireOwner: async () => ({ subject: context.owner }),
}));
vi.mock("../src/server/runtime", () => ({
  getImprovementService: () => context.service!,
}));
let db: Database;
beforeEach(async () => {
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3000");
  db = await openTestDatabase();
  await migrate(db, resolve("db/migrations"));
  const f = improvementFixture();
  context.service = new ImprovementService(db, f.repo, f.planner, f.executor);
  context.owner = "synthetic-http-owner";
});
afterEach(async () => {
  await db.close();
  vi.unstubAllEnvs();
});
const post = (body: unknown, origin = "http://127.0.0.1:3000") =>
  POST(
    new Request("http://127.0.0.1:3000/api/improvements", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
it("exercises real owner-scoped no-cache HTTP lifecycle and rejects cross-origin, oversized and unauthorized control inputs", async () => {
  const body = {
    action: "create",
    key: randomUUID(),
    text: "Improve synthetic knowledge empty state",
    projectId: null,
    includeGlobal: false,
  };
  expect((await post(body, "https://untrusted.example")).status).toBe(403);
  expect(
    (await post({ ...body, shell: "run arbitrary generated command" })).status,
  ).toBe(400);
  expect((await post({ ...body, text: "a".repeat(40000) })).status).toBe(413);
  const response = await post(body);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const { request: r } = await response.json();
  expect(
    (
      await post({
        action: "authorize",
        id: r.id,
        version: r.version,
        planHash: "a".repeat(64),
        policyHash: "b".repeat(64),
      })
    ).status,
  ).toBe(409);
  context.owner = "different-owner";
  expect(
    (
      await GET(
        new Request(`http://127.0.0.1:3000/api/improvements?id=${r.id}`),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await (
        await GET(new Request("http://127.0.0.1:3000/api/improvements"))
      ).json()
    ).requests,
  ).toEqual([]);
});
it("logs a diagnosable but content-free record for an unexpected failure", async () => {
  const logged: string[] = [];
  const spy = vi
    .spyOn(console, "error")
    .mockImplementation((line) => void logged.push(String(line)));
  context.service!.list = async () => {
    throw Object.assign(
      new Error('relation "private" missing at postgres://owner:secret@db'),
      { code: "42P01" },
    );
  };
  const response = await GET(
    new Request("http://127.0.0.1:3000/api/improvements"),
  );
  spy.mockRestore();
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("secret");
  expect(logged).toHaveLength(1);
  expect(JSON.parse(logged[0])).toEqual({
    event: "application_request_failed",
    code: "internal",
    kind: "Error",
    sqlState: "42P01",
  });
});
