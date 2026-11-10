import "server-only";
import pg from "pg";
import { createPasswordAuth, passwordConfig } from "./password";
const runtime = globalThis as typeof globalThis & {
  passwordRuntime?: {
    auth: ReturnType<typeof createPasswordAuth>;
    pool: pg.Pool;
  };
};
export function getPasswordRuntime() {
  // NODE_ENV is replaced at build time: a production artifact cannot permit
  // plaintext HTTP by changing its runtime NODE_ENV to test.
  const env = { ...process.env, NODE_ENV: process.env.NODE_ENV };
  passwordConfig(env);
  if (!runtime.passwordRuntime) {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
    pool.on("error", () =>
      console.error(JSON.stringify({ event: "auth_database_unavailable" })),
    );
    runtime.passwordRuntime = { auth: createPasswordAuth(env, pool), pool };
  }
  return { ...runtime.passwordRuntime, env };
}
