import "server-only";
import { headers } from "next/headers";
import { resolveSession } from "./policy";
export async function requireOwner() {
  // Next replaces this direct NODE_ENV access at build time. A production
  // artifact cannot be downgraded by changing its runtime environment to test.
  return resolveSession(
    { ...process.env, NODE_ENV: process.env.NODE_ENV },
    (await headers()).get("authorization"),
  );
}
