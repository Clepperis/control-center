import pg from "pg";
import type { Database, Sql } from "./types";
export function openPostgres(connectionString: string): Database {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  });
  pool.on("error", () =>
    console.error(JSON.stringify({ event: "database_pool_error" })),
  );
  const wrap = (client: pg.Pool | pg.PoolClient): Sql => ({
    async query<T extends Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) {
      const result = await client.query<T>(sql, params);
      return { rows: result.rows };
    },
  });
  return {
    ...wrap(pool),
    async transaction<T>(fn: (tx: Sql) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(wrap(client));
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
