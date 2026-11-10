import { openPostgres } from "../src/server/db/postgres";
import { KnowledgeService } from "../src/server/knowledge/service";
import { MarkdownFiles } from "../src/server/knowledge/files";
import { requireLiveMode } from "../src/server/config";
requireLiveMode(process.env);
if (!process.env.DATABASE_URL || !process.env.KNOWLEDGE_ROOT)
  throw new Error("Set local DATABASE_URL and private KNOWLEDGE_ROOT first.");
const db = openPostgres(process.env.DATABASE_URL),
  s = new KnowledgeService(db, new MarkdownFiles(process.env.KNOWLEDGE_ROOT));
try {
  await s.files.ready();
  // Explicit operator command; never a web request or paid/model operation.
  const rebuild = process.argv.includes("--rebuild");
  if (rebuild)
    await db.query(
      "UPDATE knowledge_documents SET index_status='pending',index_error=NULL,checked_at=NULL",
    );
  const total = Number(
    (await db.query("SELECT count(*) AS count FROM knowledge_documents"))
      .rows[0].count,
  );
  // A finite pass over the current corpus. Failed documents rotate to the end;
  // nothing retries forever. New documents wait for a subsequent pass/worker.
  for (let n = 0; n < Math.ceil(total / 10); n++) await s.tick();
  const states = (
    await db.query(
      "SELECT index_status,count(*) AS count FROM knowledge_documents GROUP BY index_status ORDER BY index_status",
    )
  ).rows;
  console.log(
    JSON.stringify({
      event: "knowledge_index_pass",
      rebuild,
      documents: total,
      states,
    }),
  );
  if (states.some((r) => r.index_status === "failed")) process.exitCode = 1;
} catch {
  console.error(
    JSON.stringify({
      event: "knowledge_index_failed",
      code: "storage_or_configuration",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
