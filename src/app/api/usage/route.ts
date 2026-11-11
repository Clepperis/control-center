import { resolve } from "node:path";
import { api } from "@/server/http";
import { readUsageSnapshot } from "@/server/observability/usage-snapshot";

/** Owner-only aggregate telemetry, including in demo mode. No logs, keys or prompts. */
export async function GET() {
  return api(async () => ({
    snapshot: await readUsageSnapshot(
      process.env.USAGE_SNAPSHOT_FILE || resolve(".local/usage/snapshot.json"),
    ),
  }));
}
