import { createReadStream } from "node:fs";
import { open, opendir } from "node:fs/promises";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import {
  quotaSchema,
  isQuotaCurrent,
  unavailableUsage,
  type UsageRow,
  type UsageQuota,
} from "@/domain/usage";

const quotaWindowSchema = z.strictObject({
  usedPercent: z.number().finite().min(0).max(100),
  resetsAt: z.iso.datetime({ offset: true }).nullable(),
});
const claudeQuotaFileSchema = z.strictObject({
  source: z.string().regex(/^[a-zA-Z0-9._:/ -]{1,100}$/),
  observedAt: z.iso.datetime({ offset: true }),
  model: z.string().regex(/^[a-zA-Z0-9._:/ -]{1,200}$/),
  fiveHour: quotaWindowSchema.nullable(),
  sevenDay: quotaWindowSchema.nullable(),
});
interface ClaudeQuotaObservation {
  status: "available" | "unavailable";
  reason: string | null;
  quotas: UsageQuota[];
}

/** Reads only the bounded status-line observation, never Claude login credentials. */
export async function readClaudeQuota(
  path = process.env.USAGE_CLAUDE_QUOTA_FILE ||
    join(homedir(), ".claude", "usage", "claude-quota.json"),
  now = Date.now(),
): Promise<ClaudeQuotaObservation> {
  const unavailable = (reason: string): ClaudeQuotaObservation => ({
    status: "unavailable",
    reason,
    quotas: [],
  });
  if (!isAbsolute(path)) return unavailable("invalid_quota_file");
  try {
    const file = await open(path, "r");
    let raw: string;
    try {
      if (!(await file.stat()).isFile())
        return unavailable("invalid_quota_file");
      // Bound the read itself, including when the writer replaces/grows the file.
      const bytes = Buffer.alloc(16385);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > 16384) return unavailable("invalid_quota_file");
      raw = new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(0, bytesRead),
      );
    } finally {
      await file.close();
    }
    const parsed = claudeQuotaFileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return unavailable("invalid_quota_file");
    const observation = parsed.data;
    const quotas = (["fiveHour", "sevenDay"] as const).flatMap((label) => {
      const window = observation[label];
      if (!window) return [];
      const quota: UsageQuota = {
        service: "claude",
        label,
        usedPercent: window.usedPercent,
        resetsAt: window.resetsAt
          ? new Date(window.resetsAt).toISOString()
          : null,
        observedAt: new Date(observation.observedAt).toISOString(),
      };
      return isQuotaCurrent(quota, now) ? [quota] : [];
    });
    return quotas.length
      ? { status: "available", reason: null, quotas }
      : unavailable("no_current_quota");
  } catch {
    // Missing, unreadable, partially written and malformed JSON are all unknown.
    return unavailable("quota_file_unavailable");
  }
}

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}
function token(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}
function date(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return null;
  return new Date(value).toISOString();
}
function name(value: unknown): string {
  // Only a model identifier ever leaves the reader, never arbitrary log text.
  return typeof value === "string" && /^[a-zA-Z0-9._:/ -]{1,200}$/.test(value)
    ? value
    : "unknown";
}
interface Receipt {
  id: string;
  session: string;
  at: string;
  model: string;
  input: number;
  cached: number;
  output: number;
  total: number;
}

/** Parses only usage metadata; content, tool calls, credentials and paths are discarded. */
export class LocalUsageReader {
  private receipts = new Map<string, Receipt>();
  private session = "";
  private model = "unknown";
  private ignored = false;
  private quotas: UsageQuota[] = [];
  private quotaAt = "";
  partial = false;
  constructor(private service: "claude" | "codex") {}
  file() {
    this.session = "";
    this.model = "unknown";
    this.ignored = false;
  }
  line(line: string) {
    if (!line.trim()) return;
    if (line.length > 2_000_000) {
      this.partial = true;
      return;
    }
    let r: Json;
    try {
      r = object(JSON.parse(line));
    } catch {
      this.partial = true;
      return;
    }
    if (this.service === "codex") this.codex(r);
    else this.claude(r);
  }
  private codex(r: Json) {
    const p = object(r.payload);
    if (r.type === "session_meta") {
      this.session = typeof p.id === "string" ? p.id : "";
      this.ignored = /paperclip/i.test(String(p.originator ?? ""));
      return;
    }
    if (r.type === "turn_context") {
      this.model = name(p.model);
      return;
    }
    if (this.ignored || r.type !== "event_msg" || p.type !== "token_count")
      return;
    const at = date(r.timestamp);
    if (at && p.rate_limits) this.readQuotas(object(p.rate_limits), at);
    const u = object(object(p.info).total_token_usage);
    if (!Object.keys(u).length) return;
    const input = token(u.input_tokens),
      output = token(u.output_tokens),
      cached = token(u.cached_input_tokens),
      total = token(u.total_tokens);
    if (
      !this.session ||
      !at ||
      input === null ||
      output === null ||
      cached === null ||
      total === null ||
      cached > input ||
      total !== input + output
    ) {
      this.partial = true;
      return;
    }
    // Cumulative counters can be emitted repeatedly. Deduplicate across copied files too.
    const id = `${this.session}:${input}:${cached}:${output}:${total}`;
    const previous = this.receipts.get(id);
    if (!previous || at < previous.at)
      this.receipts.set(id, {
        id,
        session: this.session,
        at,
        model: this.model,
        input,
        cached,
        output,
        total,
      });
  }
  private readQuotas(r: Json, at: string) {
    if (at < this.quotaAt) return;
    const quotas: UsageQuota[] = [];
    for (const key of ["primary", "secondary"] as const) {
      const window = object(r[key]);
      const reset =
        typeof window.resets_at === "number" &&
        Number.isFinite(window.resets_at) &&
        window.resets_at > 0 &&
        window.resets_at < 253402300800
          ? new Date(window.resets_at * 1000).toISOString()
          : null;
      const parsed = quotaSchema.safeParse({
        service: "codex",
        label: key,
        usedPercent: window.used_percent,
        resetsAt: reset,
        observedAt: at,
      });
      if (parsed.success) quotas.push(parsed.data);
    }
    if (quotas.length) {
      this.quotaAt = at;
      this.quotas = quotas;
    }
  }
  private claude(r: Json) {
    if (r.type !== "assistant") return;
    const m = object(r.message),
      u = object(m.usage),
      at = date(r.timestamp);
    if (!Object.keys(u).length) return;
    const input = token(u.input_tokens),
      output = token(u.output_tokens),
      cached = token(u.cache_read_input_tokens ?? 0),
      creation = token(u.cache_creation_input_tokens ?? 0);
    if (
      !at ||
      typeof m.id !== "string" ||
      typeof r.requestId !== "string" ||
      input === null ||
      output === null ||
      cached === null ||
      creation === null
    ) {
      this.partial = true;
      return;
    }
    const id = `${r.requestId}:${m.id}`;
    // Streaming assistant blocks share a request/message ID. Keep the final counters.
    const previous = this.receipts.get(id);
    const receipt = {
      id,
      session: "",
      at,
      model: name(m.model),
      input: input + cached + creation,
      cached,
      output,
      total: input + cached + creation + output,
    };
    if (
      !previous ||
      receipt.total > previous.total ||
      (receipt.total === previous.total && at > previous.at)
    )
      this.receipts.set(id, receipt);
  }
  result(from: string, to: string): { rows: UsageRow[]; quotas: UsageQuota[] } {
    const rows = new Map<string, UsageRow>();
    const previous = new Map<string, Receipt>();
    for (const r of [...this.receipts.values()].sort(
      (a, b) => a.at.localeCompare(b.at) || a.total - b.total,
    )) {
      let delta = r;
      if (this.service === "codex") {
        const p = previous.get(r.session);
        previous.set(r.session, r);
        if (p) {
          if (r.input < p.input || r.output < p.output || r.cached < p.cached) {
            // A reset/truncated counter cannot safely be attributed to this window.
            this.partial = true;
            continue;
          }
          delta = {
            ...r,
            input: r.input - p.input,
            cached: r.cached - p.cached,
            output: r.output - p.output,
            total: r.total - p.total,
          };
        }
      }
      if (r.at < from || r.at > to || delta.total === 0) continue;
      const row =
        rows.get(r.model) ??
        ({
          service: this.service,
          scope: "local",
          status: "available",
          reason: null,
          model: r.model,
          records: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cost: null,
          currency: null,
          billing: "unknown",
          observedAt: null,
        } satisfies UsageRow);
      row.records!++;
      row.inputTokens! += delta.input;
      row.cachedInputTokens! += delta.cached;
      row.outputTokens! += delta.output;
      row.totalTokens! += delta.total;
      row.observedAt = r.at;
      rows.set(r.model, row);
    }
    if (this.partial)
      for (const row of rows.values()) {
        row.status = "partial";
        row.reason = "incomplete_logs";
      }
    return {
      rows: rows.size
        ? [...rows.values()]
        : [
            unavailableUsage(
              this.service,
              "local",
              this.partial ? "incomplete_logs" : "no_receipts_in_window",
            ),
          ],
      quotas: this.quotas,
    };
  }
}

async function* files(root: string): AsyncGenerator<string> {
  // Dirents avoid following symlinks/junctions into unrelated directories.
  for await (const entry of await opendir(root)) {
    if (entry.isSymbolicLink()) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) yield path;
  }
}
export async function readLocalUsage(
  service: "claude" | "codex",
  roots: string[],
  from: string,
  to: string,
) {
  const reader = new LocalUsageReader(service);
  let found = false,
    failure = false,
    count = 0;
  for (const root of roots) {
    try {
      for await (const path of files(root)) {
        if (++count > 10000) {
          reader.partial = true;
          break;
        }
        found = true;
        reader.file();
        try {
          const lines = createInterface({
            input: createReadStream(path),
            crlfDelay: Infinity,
          });
          for await (const line of lines) reader.line(line);
        } catch {
          reader.partial = true;
        }
      }
    } catch {
      failure = true;
    }
  }
  if (!found)
    return {
      rows: [
        unavailableUsage(
          service,
          "local",
          failure ? "logs_unavailable" : "no_logs",
        ),
      ],
      quotas: [],
    };
  if (failure) reader.partial = true;
  return reader.result(from, to);
}
