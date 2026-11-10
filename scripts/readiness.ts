import { openPostgres } from "../src/server/db/postgres";
import { readiness } from "../src/server/readiness";
const db = openPostgres(process.env.DATABASE_URL ?? "");
try {
  await readiness(
    db,
    process.env.KNOWLEDGE_ROOT ?? "",
    process.env.RELEASE_COMMIT ?? "",
  );
  const response = await fetch("http://127.0.0.1:3210/api/health", {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Web unavailable.");
  console.log(JSON.stringify({ status: "ready" }));
} catch {
  console.error(
    JSON.stringify({
      status: "not_ready",
      code: "web_schema_storage_or_worker",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
