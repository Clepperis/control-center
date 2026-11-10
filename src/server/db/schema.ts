import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Sql } from "./types";
export async function schemaManifest(directory: string) {
  const files = (await readdir(directory))
    .filter((n) => /^\d+_.+\.sql$/.test(n))
    .sort();
  return Promise.all(
    files.map(async (name) => ({
      name,
      checksum: createHash("sha256")
        .update(await readFile(join(directory, name)))
        .digest("hex"),
    })),
  );
}
export async function checkSchema(db: Sql, directory: string) {
  const expected = await schemaManifest(directory);
  const applied = (
    await db.query<{ name: string; checksum: string }>(
      "SELECT name,checksum FROM schema_migrations ORDER BY name",
    )
  ).rows;
  if (JSON.stringify(expected) !== JSON.stringify(applied))
    throw new Error("Schema is pending, changed, or newer than this release.");
  return expected;
}
