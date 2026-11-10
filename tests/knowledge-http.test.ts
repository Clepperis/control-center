import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { openTestDatabase } from "./pglite";
import { migrate } from "../src/server/db/migrate";
import { KnowledgeService } from "../src/server/knowledge/service";
import { MarkdownFiles } from "../src/server/knowledge/files";
import { GET, POST } from "../src/app/api/knowledge/route";
import type { Database } from "../src/server/db/types";
const context = vi.hoisted(() => ({
  service: null as KnowledgeService | null,
  owner: "synthetic-http-owner",
}));
vi.mock("../src/server/runtime", () => ({
  getKnowledgeService: () => context.service!,
}));
vi.mock("../src/server/auth/session", () => ({
  requireOwner: async () => ({ subject: context.owner }),
}));
let root: string, db: Database;
beforeEach(async () => {
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3000");
  root = await mkdtemp(join(tmpdir(), "cc-fictional-http-"));
  db = await openTestDatabase();
  await migrate(db, resolve("db/migrations"));
  context.service = new KnowledgeService(db, new MarkdownFiles(root));
  context.owner = "synthetic-http-owner";
});
afterEach(async () => {
  await db.close();
  await rm(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
const post = (body: unknown, origin = "http://127.0.0.1:3000") =>
  POST(
    new Request("http://127.0.0.1:3000/api/knowledge", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
it("executes actual guarded route handlers: project/create/read/update/exportable revisions and stale conflict", async () => {
  const p = await (
    await post({ action: "project", name: "Synthetic HTTP Atlas" })
  ).json();
  const r = await post({
    action: "create",
    projectId: p.id,
    title: "HTTP document",
    body: "# Bound\nOnly synthetic content",
  });
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("no-store");
  const d = await r.json();
  expect(
    (
      await GET(
        new Request(
          `http://127.0.0.1:3000/api/knowledge?op=document&id=${d.id}`,
        ),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await post({
        action: "update",
        id: d.id,
        hash: d.hash,
        body: "New version",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await post({
        action: "update",
        id: d.id,
        hash: d.hash,
        body: "Conflicting version",
      })
    ).status,
  ).toBe(409);
  const revision = await (
    await GET(
      new Request(
        `http://127.0.0.1:3000/api/knowledge?op=revision&id=${d.id}&revision=1`,
      ),
    )
  ).json();
  expect(revision.body).toContain("Only synthetic");
  context.owner = "other-owner";
  expect(
    (
      await GET(
        new Request(
          `http://127.0.0.1:3000/api/knowledge?op=document&id=${d.id}`,
        ),
      )
    ).status,
  ).toBe(404);
});
it("rejects cross-origin mutation, oversized bodies, arbitrary paths, unknown actions and malformed citation IDs", async () => {
  expect(
    (
      await post(
        { action: "project", name: "Denied" },
        "https://untrusted.example",
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await post({
        action: "create",
        projectId: null,
        title: "large",
        body: "a".repeat(600001),
      })
    ).status,
  ).toBe(413);
  expect(
    (
      await post({
        action: "create",
        projectId: null,
        title: "path",
        body: "x",
        path: "../secret",
      })
    ).status,
  ).toBe(400);
  expect((await post({ action: "run-script" })).status).toBe(400);
  expect(
    (
      await GET(
        new Request(
          "http://127.0.0.1:3000/api/knowledge?op=citation&message=../../secret&label=S99",
        ),
      )
    ).status,
  ).toBe(400);
});
