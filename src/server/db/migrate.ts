import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Database } from "./types";
export async function migrate(db: Database, directory: string) {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(718231)");
    await tx.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const applied = (
      await tx.query<{ name: string; checksum: string }>(
        "SELECT name,checksum FROM schema_migrations",
      )
    ).rows;
    for (const name of (await readdir(directory))
      .filter((n) => /^\d+_.+\.sql$/.test(n))
      .sort()) {
      const sql = await readFile(`${directory}/${name}`, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = applied.find((m) => m.name === name);
      if (existing) {
        if (existing.checksum !== checksum)
          throw new Error(`Migration modified: ${name}`);
        continue;
      }
      await tx.query(sql);
      await tx.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
        [name, checksum],
      );
    }
  });
}
