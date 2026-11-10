import { resolve } from "node:path";
import { openPostgres } from "../src/server/db/postgres";
import { checkSchema } from "../src/server/db/schema";
import { MarkdownFiles, parse } from "../src/server/knowledge/files";
import { KnowledgeService } from "../src/server/knowledge/service";
import { Store } from "../src/server/orchestration/store";
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  !/^\/cc_restore_[a-z0-9_]+$/.test(url.pathname)
)
  throw new Error(
    "Restore verification requires a disposable loopback cc_restore_* database.",
  );
const db = openPostgres(url.href);
try {
  await checkSchema(db, resolve("db/migrations"));
  const files = new MarkdownFiles(process.env.KNOWLEDGE_ROOT ?? "");
  const knowledge = new KnowledgeService(db, files);
  let documents = 0,
    revisions = 0;
  for (const table of ["knowledge_documents", "knowledge_revisions"]) {
    const rows = (
      await db.query<{ path: string; content_hash: string }>(
        `SELECT path,content_hash FROM ${table}`,
      )
    ).rows;
    for (const row of rows) {
      if (parse(await files.read(row.path)).hash !== row.content_hash)
        throw new Error("Restored Markdown mismatch.");
    }
    if (table === "knowledge_documents") documents = rows.length;
    else revisions = rows.length;
  }
  const owners = (await db.query<{ id: string }>("SELECT id FROM auth_user"))
    .rows;
  if (owners.length !== 1)
    throw new Error("Restore requires the single owner.");
  // Exercise production owner-scoped application reads after decryption/restore.
  await new Store(db).listConversations(owners[0].id);
  await knowledge.projects(owners[0].id);
  console.log(
    JSON.stringify({
      status: "restore_verified",
      documents,
      revisions,
      owners: owners.length,
    }),
  );
} catch {
  console.error(
    JSON.stringify({
      status: "restore_failed",
      code: "schema_owner_or_markdown",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
