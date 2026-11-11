import { homedir } from "node:os";
import { join, resolve, delimiter } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  readClaudeQuota,
  readLocalUsage,
} from "../src/server/observability/local-usage";
import {
  nexosUsage,
  usageReport,
  writeUsageSnapshot,
} from "../src/server/observability/usage-snapshot";
import { unavailableUsage, usageSnapshotSchema } from "../src/domain/usage";
import { openPostgres } from "../src/server/db/postgres";
import { paperclipConfig } from "../src/server/config";
import { PaperclipUsageClient } from "../src/integrations/paperclip-usage";
import { nexosKeyUsage } from "../src/integrations/nexos-usage";

const days = z.coerce
  .number()
  .int()
  .min(1)
  .max(90)
  .parse(process.env.USAGE_WINDOW_DAYS ?? 30);
const interval = z.coerce
  .number()
  .int()
  .min(60000)
  .max(3600000)
  .parse(process.env.USAGE_SYNC_INTERVAL_MS ?? 300000);
const path =
  process.env.USAGE_SNAPSHOT_FILE || resolve(".local/usage/snapshot.json");
const roots = (value: string | undefined, defaults: string[]) =>
  value ? value.split(delimiter).filter(Boolean) : defaults;
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => controller.abort());

async function sync() {
  const to = new Date().toISOString(),
    from = new Date(
      Date.parse(to.slice(0, 10)) - (days - 1) * 86400000,
    ).toISOString();
  const [codex, claude, claudeQuota] = await Promise.all([
    readLocalUsage(
      "codex",
      roots(process.env.USAGE_CODEX_ROOTS, [
        join(homedir(), ".codex/sessions"),
        join(homedir(), ".codex/archived_sessions"),
      ]),
      from,
      to,
    ),
    readLocalUsage(
      "claude",
      roots(process.env.USAGE_CLAUDE_ROOTS, [
        join(homedir(), ".claude/projects"),
      ]),
      from,
      to,
    ),
    readClaudeQuota(undefined, Date.parse(to)),
  ]);
  let nexos = [
    unavailableUsage("nexos", "control-center", "database_unavailable"),
  ];
  if (process.env.DATABASE_URL) {
    const db = openPostgres(process.env.DATABASE_URL);
    try {
      nexos = await nexosUsage(db, from, to);
    } catch {
      /* Missing DB/migration is unknown, not zero. */
    } finally {
      await db.close();
    }
  }
  let nexosAccount = unavailableUsage(
    "nexos",
    "nexos-key",
    "nexos_usage_unavailable",
  );
  try {
    nexosAccount = await nexosKeyUsage(
      process.env.NEXOS_API_KEY ?? "",
      from,
      to,
    );
  } catch {
    /* Scope/permission failures do not erase per-call receipts. */
  }
  let client: PaperclipUsageClient | null = null;
  let managed = [
    unavailableUsage("claude", "paperclip", "paperclip_unavailable"),
    unavailableUsage("codex", "paperclip", "paperclip_unavailable"),
  ];
  try {
    client = new PaperclipUsageClient(paperclipConfig(process.env));
    managed = await client.usage(from, to);
  } catch {
    /* Keep local/Nexos telemetry when Paperclip is unavailable. */
  }
  const snapshot = usageSnapshotSchema.parse({
    version: 1,
    generatedAt: new Date().toISOString(),
    from,
    to,
    rows: [nexosAccount, ...nexos, ...claude.rows, ...codex.rows, ...managed],
    quotas: [...claudeQuota.quotas, ...codex.quotas],
  });
  await writeUsageSnapshot(path, snapshot);
  let published = 0;
  if (process.argv.includes("--publish")) {
    const ids = z
      .array(z.uuid())
      .min(1)
      .max(20)
      .parse(
        (process.env.USAGE_PAPERCLIP_AGENT_IDS ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    if (!client) throw new Error("Paperclip unavailable.");
    for (const id of ids) {
      await client.publish(id, usageReport(snapshot));
      published++;
    }
  }
  console.log(
    JSON.stringify({
      event: "usage.synced",
      generatedAt: snapshot.generatedAt,
      rows: snapshot.rows.length,
      quotas: snapshot.quotas.length,
      published,
      claudeQuota: claudeQuota.status,
      claudeQuotaReason: claudeQuota.reason,
      unavailable: snapshot.rows
        .filter((r) => r.status === "unavailable")
        .map((r) => `${r.service}:${r.scope}:${r.reason}`),
    }),
  );
}

do {
  try {
    await sync();
  } catch {
    console.error(
      JSON.stringify({
        event: "usage.sync_failed",
        reason: "check_configuration_or_source",
        secretsLogged: false,
      }),
    );
    if (!process.argv.includes("--watch")) process.exitCode = 1;
  }
  if (!process.argv.includes("--watch") || controller.signal.aborted) break;
  try {
    await delay(interval, undefined, { signal: controller.signal });
  } catch {
    break;
  }
} while (!controller.signal.aborted);
