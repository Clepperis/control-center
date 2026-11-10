import { access, lstat, statfs } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import type { Database } from "./db/types";
import { checkSchema } from "./db/schema";
export async function readiness(db: Database, root: string, release: string) {
  await checkSchema(db, resolve("db/migrations"));
  if (!root || !release) throw new Error("Runtime configuration missing.");
  for (const dir of [
    root,
    ...["documents", "history", "conflicts"].map((n) =>
      join(/* turbopackIgnore: true */ root, n),
    ),
  ]) {
    const info = await lstat(dir);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error("Storage unavailable.");
    await access(dir, constants.R_OK | constants.W_OK);
  }
  const disk = await statfs(root);
  if (disk.bavail * disk.bsize < 1024 ** 3)
    throw new Error("Disk reserve below 1 GiB.");
  const heartbeat = (
    await db.query<{ ready: boolean }>(
      "SELECT (completed_at > now()-interval '150 seconds' AND release=$1) AS ready FROM worker_heartbeat WHERE singleton",
      [release],
    )
  ).rows[0];
  if (!heartbeat?.ready)
    throw new Error("Worker unavailable or release mismatch.");
}
