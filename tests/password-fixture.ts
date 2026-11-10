import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import pg from "pg";
import { resolve } from "node:path";
import { openPostgres } from "../src/server/db/postgres";
import { migrate } from "../src/server/db/migrate";
import { createPasswordAuth } from "../src/server/auth/password";
import { setOwnerPassword } from "../src/server/auth/operator";
import { passwordHttp } from "../src/server/auth/password-http";

export const testPassword = "Synthetic only long passphrase ąčę 2026";
export async function passwordFixture(
  directory?: string,
  origin = "https://control.example",
) {
  const engine = await PGlite.create(directory);
  const socket = new PGLiteSocketServer({
    db: engine,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 12,
  });
  await socket.start();
  const connectionString = `postgresql://postgres:synthetic@${socket.getServerConn()}/postgres`;
  const pool = new pg.Pool({ connectionString, max: 4 });
  const db = openPostgres(connectionString);
  await migrate(db, resolve("db/migrations"));
  const env = {
    NODE_ENV: "test",
    AUTH_MODE: "password",
    APP_ORIGIN: origin,
    DATABASE_URL: connectionString,
    AUTH_SECRET: "synthetic-test-secret-at-least-thirty-two-characters",
    OWNER_SUBJECT: "synthetic-owner",
  };
  const auth = createPasswordAuth(env, pool);
  const call = (
    path = "sign-in/email",
    body: object = { email: "owner@example.com", password: testPassword },
    headers: Record<string, string> = {},
  ) =>
    passwordHttp(
      new Request(origin + "/api/auth/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...headers,
        },
        body: JSON.stringify(body),
      }),
      env,
      auth,
      pool,
    );
  return {
    engine,
    socket,
    pool,
    db,
    env,
    auth,
    call,
    bootstrap: () =>
      setOwnerPassword(db, env, "bootstrap", "owner@example.com", testPassword),
    async close() {
      await pool.end();
      await db.close();
      await socket.stop();
      await engine.close();
    },
  };
}
export function cookieHeader(response: Response) {
  return response.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
}
