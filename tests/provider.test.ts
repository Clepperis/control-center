import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../src/server/auth/session", () => ({ requireOwner: vi.fn() }));
vi.mock("../src/server/runtime", () => ({}));
const { knowledgeConnection } = await import("../src/data/provider");

const created: string[] = [];
afterEach(async () => {
  for (const d of created.splice(0)) await rm(d, { recursive: true });
});
it("reports the knowledge volume from an actual check, not a fixed label", async () => {
  expect((await knowledgeConnection(undefined)).kind).toBe("disconnected");
  const root = await mkdtemp(join(tmpdir(), "cc-knowledge-status-"));
  created.push(root);
  const ok = await knowledgeConnection(root);
  expect(ok.kind).toBe("verified");
  // A root inside the public checkout is refused, and says why.
  const refused = await knowledgeConnection(resolve("private-knowledge"));
  expect(refused).toMatchObject({ kind: "unavailable" });
  expect(refused.detail).toContain("KNOWLEDGE_ROOT");
  expect((await knowledgeConnection("relative/path")).kind).toBe("unavailable");
});
