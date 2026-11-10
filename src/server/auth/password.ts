import { betterAuth } from "better-auth";
import { hash, verify } from "@node-rs/argon2";
import type pg from "pg";
import { z } from "zod";
import { AccessError, type Env } from "./policy";

export const AUTH_LOCK = 718236;
export const passwordSchema = z.string().min(15).max(1024);
export const hashOwnerPassword = (password: string) =>
  hash(passwordSchema.parse(password), {
    algorithm: 2, // Argon2id (the binding exports an ambient const enum).
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
  });

export function passwordConfig(env: Env) {
  try {
    const origin = new URL(env.APP_ORIGIN ?? "");
    if (
      origin.origin !== env.APP_ORIGIN ||
      origin.username ||
      origin.password ||
      (origin.protocol !== "https:" &&
        !(
          env.NODE_ENV !== "production" &&
          origin.protocol === "http:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)
        )) ||
      !env.AUTH_SECRET ||
      env.AUTH_SECRET.length < 32 ||
      !env.DATABASE_URL ||
      !env.OWNER_SUBJECT ||
      !/^[A-Za-z0-9:@._-]{3,200}$/.test(env.OWNER_SUBJECT) ||
      env.OWNER_SUBJECT === "development-owner" ||
      env.AUTH_MODE !== "password"
    )
      throw new Error("configuration");
    return {
      origin: origin.origin,
      secret: env.AUTH_SECRET,
      subject: env.OWNER_SUBJECT,
    };
  } catch {
    throw new AccessError(503, "Prisijungimas nesukonfigūruotas.");
  }
}

// Library owns password verification, session tokens, signing, expiry, cookies
// and CSRF. No public account management or alternate password backend.
export function createPasswordAuth(env: Env, pool: pg.Pool) {
  const config = passwordConfig(env);
  return betterAuth({
    appName: "Control Center",
    baseURL: config.origin,
    secret: config.secret,
    database: pool,
    trustedOrigins: [config.origin],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 15,
      maxPasswordLength: 1024,
      password: {
        hash: hashOwnerPassword,
        verify: ({ hash: encoded, password }) => verify(encoded, password),
      },
      revokeSessionsOnPasswordReset: true,
    },
    user: { modelName: "auth_user" },
    account: { modelName: "auth_account", accountLinking: { enabled: false } },
    verification: { modelName: "auth_verification" },
    session: {
      modelName: "auth_session",
      expiresIn: 60 * 60 * 12,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    // The HTTP facade applies an atomic database-wide budget. Header-based
    // library counters would permit spoofing or non-atomic concurrent updates.
    rateLimit: { enabled: false },
    advanced: {
      useSecureCookies: config.origin.startsWith("https:"),
      cookiePrefix: "control-center",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
      },
      ipAddress: { ipAddressHeaders: [] },
    },
    databaseHooks: {
      user: { create: { before: async () => false } },
      session: {
        create: {
          before: async (session) =>
            session.userId === config.subject ? { data: session } : false,
        },
      },
    },
    telemetry: { enabled: false },
    logger: { disabled: true },
  });
}
export type PasswordAuth = ReturnType<typeof createPasswordAuth>;

export async function passwordOwner(
  auth: PasswordAuth,
  env: Env,
  headers: Headers,
) {
  const config = passwordConfig(env);
  try {
    const session = await auth.api.getSession({ headers });
    if (!session || session.user.id !== config.subject)
      throw new AccessError(401, "Reikia savininko prisijungimo.");
    return { subject: session.user.id, mode: "password" as const };
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(503, "Prisijungimo paslauga laikinai nepasiekiama.");
  }
}
