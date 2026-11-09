import { PGlite } from "@electric-sql/pglite";
import type { Database, Sql } from "../src/server/db/types";
export async function openTestDatabase(directory?: string): Promise<Database> {
  const pg = new PGlite(directory);
  await pg.waitReady;
  const wrap = (client: Pick<PGlite, "query" | "exec">): Sql => ({
    async query<T extends Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) {
      if (!params && sql.includes(";")) {
        const results = await client.exec(sql);
        return { rows: (results.at(-1)?.rows ?? []) as T[] };
      }
      const result = await client.query<T>(sql, params);
      return { rows: result.rows };
    },
  });
  return {
    ...wrap(pg),
    async transaction<T>(fn: (tx: Sql) => Promise<T>) {
      return pg.transaction((tx) => fn(wrap(tx)));
    },
    async close() {
      await pg.close();
    },
  };
}
