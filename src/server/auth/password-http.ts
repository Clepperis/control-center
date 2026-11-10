import { z } from "zod";
import type pg from "pg";
import { AUTH_LOCK, passwordConfig, type PasswordAuth } from "./password";
import { AccessError, type Env } from "./policy";

const login = z
  .object({
    email: z.email().max(254),
    password: z.string().min(15).max(1024),
    callbackURL: z.string().optional(),
  })
  .strict();
const message =
  "Prisijungti nepavyko. Patikrinkite duomenis arba bandykite vėliau.";
function result(status: number) {
  return Response.json(status === 200 ? { ok: true } : { error: message }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 429 ? { "Retry-After": "900" } : {}),
    },
  });
}
export function safeDestination(value: string | null | undefined) {
  // Explicit app destinations only, no protocol-relative or encoded paths.
  return [
    "/",
    "/chat",
    "/projects",
    "/agents",
    "/automations",
    "/knowledge",
    "/improve",
    "/settings",
  ].includes(value ?? "")
    ? value!
    : "/";
}
async function jsonBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AccessError(415, message);
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, message);
  let raw = "",
    bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) {
        await reader.cancel();
        throw new AccessError(413, message);
      }
      raw += decoder.decode(value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
export async function passwordHttp(
  request: Request,
  env: Env,
  auth: PasswordAuth,
  pool: pg.Pool,
) {
  try {
    const config = passwordConfig(env);
    const path = new URL(request.url).pathname;
    if (
      request.method !== "POST" ||
      !["/api/auth/sign-in/email", "/api/auth/sign-out"].includes(path)
    )
      return result(404);
    if (
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return result(403);
    const body = await jsonBody(request);
    let normalized: object = {};
    if (path.endsWith("/email")) {
      const parsed = login.safeParse(body);
      if (!parsed.success) return result(400);
      if (
        parsed.data.callbackURL !== undefined &&
        safeDestination(parsed.data.callbackURL) !== parsed.data.callbackURL
      )
        return result(400);
      normalized = { email: parsed.data.email, password: parsed.data.password };
    } else if (!z.object({}).strict().safeParse(body).success)
      return result(400);

    // Serialize login with operator reset, including the hash-check/session-
    // creation interval. A pre-reset verification cannot create a late session.
    const client = await pool.connect();
    let locked = false;
    try {
      if (path.endsWith("/email")) {
        const lock = await client.query<{ locked: boolean }>(
          "SELECT pg_try_advisory_lock($1) AS locked",
          [AUTH_LOCK],
        );
        locked = lock.rows[0].locked;
        if (!locked) return result(429);
        const budget = await client.query<{ attempts: number }>(`
          INSERT INTO auth_login_budget(singleton,started_at,attempts) VALUES(true,now(),1)
          ON CONFLICT(singleton) DO UPDATE SET
            attempts=CASE WHEN auth_login_budget.started_at <= now()-interval '15 minutes' THEN 1 ELSE LEAST(auth_login_budget.attempts+1,11) END,
            started_at=CASE WHEN auth_login_budget.started_at <= now()-interval '15 minutes' THEN now() ELSE auth_login_budget.started_at END
          RETURNING attempts`);
        if (budget.rows[0].attempts > 10) return result(429);
      }
      const headers = new Headers({
        "Content-Type": "application/json",
        Origin: config.origin,
      });
      if (request.headers.has("cookie"))
        headers.set("cookie", request.headers.get("cookie")!);
      const response = await auth.handler(
        new Request(config.origin + path, {
          method: "POST",
          headers,
          body: JSON.stringify(normalized),
        }),
      );
      if (!response.ok) return result(response.status >= 500 ? 503 : 401);
      const reply = result(200);
      // Never forward raw library session tokens or user data in JSON.
      for (const cookie of response.headers.getSetCookie())
        reply.headers.append("Set-Cookie", cookie);
      return reply;
    } finally {
      let discarded = false;
      if (locked) {
        try {
          await client.query("SELECT pg_advisory_unlock($1)", [AUTH_LOCK]);
        } catch {
          client.release(true);
          discarded = true;
        }
      }
      if (!discarded) client.release();
    }
  } catch (error) {
    if (error instanceof AccessError) return result(error.status);
    if (error instanceof SyntaxError) return result(400);
    return result(503);
  }
}
