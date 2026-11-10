import "server-only";
import { headers } from "next/headers";
import { resolveSession } from "./policy";
import { getPasswordRuntime } from "./password-runtime";
import { passwordOwner } from "./password";
export async function requireOwner() {
  if (process.env.AUTH_MODE === "password") {
    const { auth, env } = getPasswordRuntime();
    return passwordOwner(auth, env, new Headers(await headers()));
  }
  // Next replaces this direct NODE_ENV access at build time. A production
  // artifact cannot be downgraded by changing its runtime environment to test.
  return resolveSession(
    { ...process.env, NODE_ENV: process.env.NODE_ENV },
    (await headers()).get("authorization"),
  );
}
