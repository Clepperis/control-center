import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { openPostgres } from "../src/server/db/postgres";
import { migrate } from "../src/server/db/migrate";
import { setOwnerPassword } from "../src/server/auth/operator";
import { KnowledgeService } from "../src/server/knowledge/service";
import { MarkdownFiles } from "../src/server/knowledge/files";
const url = new URL(process.env.TEST_DATABASE_URL ?? "");
assert(
  ["127.0.0.1", "localhost"].includes(url.hostname) &&
    url.pathname === "/cc_phase6_fixture",
  "Disposable loopback test database only",
);
const db = openPostgres(url.href);
const knowledge = await mkdtemp(join(tmpdir(), "cc-native-knowledge-"));
try {
  await migrate(db, resolve("db/migrations"));
  const env = {
    NODE_ENV: "production",
    AUTH_MODE: "password",
    APP_ORIGIN: "https://control.example",
    OWNER_SUBJECT: "synthetic-native-owner",
    AUTH_SECRET: "synthetic-native-auth-secret-thirty-two-characters",
    DATABASE_URL: url.href,
  };
  await setOwnerPassword(
    db,
    env,
    "bootstrap",
    "owner@example.com",
    "Synthetic native long passphrase",
  );
  await db.query(
    "INSERT INTO conversations(id,owner_subject,title) VALUES($1,$2,$3)",
    [randomUUID(), env.OWNER_SUBJECT, "Synthetic persistent conversation"],
  );
  const service = new KnowledgeService(db, new MarkdownFiles(knowledge));
  const project = await service.createProject(
    env.OWNER_SUBJECT,
    "Synthetic native project",
  );
  const doc = await service.create(env.OWNER_SUBJECT, {
    projectId: project.id,
    title: "Synthetic native knowledge",
    body: "Restoration preserves this synthetic document and its revision history.",
  });
  await service.update(env.OWNER_SUBJECT, doc.id, {
    hash: doc.hash,
    body: "Restoration preserves the updated synthetic document and its previous revision.",
  });
  await mkdir(".local/phase-6", { recursive: true });
  await writeFile(
    ".local/phase-6/native-fixture.json",
    JSON.stringify({ env, knowledge }),
    { mode: 0o600 },
  );
  console.log(
    "Prepared isolated native PostgreSQL fixture with an owner, conversation, Markdown and revision history.",
  );
} finally {
  await db.close();
}
