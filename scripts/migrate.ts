import { resolve } from "node:path";
import { openPostgres } from "../src/server/db/postgres";
import { migrate } from "../src/server/db/migrate";
if (!process.env.DATABASE_URL)
  throw new Error(
    "Set DATABASE_URL in .env.local to your own application PostgreSQL database.",
  );
const db = openPostgres(process.env.DATABASE_URL);
try {
  await migrate(db, resolve("db/migrations"));
  console.log("Application migrations applied.");
} catch {
  console.error(
    "Migration failed. Check database access and migration history locally. Credentials were not logged.",
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
