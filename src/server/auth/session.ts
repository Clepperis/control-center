import "server-only";
import { headers } from "next/headers";
import { resolveSession } from "./policy";
export async function requireOwner() {
  return resolveSession(process.env, (await headers()).get("authorization"));
}
