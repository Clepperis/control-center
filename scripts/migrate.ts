import { resolve } from "node:path";
import { openPostgres } from "../src/server/db/postgres";
import { migrate } from "../src/server/db/migrate";
import { checkSchema } from "../src/server/db/schema";
const connection =
  process.env.MIGRATION_DATABASE_URL ??
  (process.argv.includes("--check") || process.env.NODE_ENV !== "production"
    ? process.env.DATABASE_URL
    : undefined);
if (!connection)
  throw new Error(
    "Set DATABASE_URL in .env.local to your own application PostgreSQL database.",
  );
const db = openPostgres(connection);
try {
  if (process.argv.includes("--check")) {
    await checkSchema(db, resolve("db/migrations"));
    console.log("Application schema matches this release.");
  } else {
    await migrate(db, resolve("db/migrations"));
    console.log("Application migrations applied.");
  }
} catch {
  console.error(
    "Migration failed. Check database access and migration history locally. Credentials were not logged.",
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
