# Shared Nexos, Claude and Codex usage

`npm run usage:sync` collects metadata into a private, gitignored snapshot.
The owner can read it on `/statistics` or `GET /api/usage`, including in demo
mode. It does not make paid model calls, launch agents or change budgets.

Sources:

- **Nexos.ai / API key scope:** authenticated `GET /v1/usage`, inclusive UTC
  calendar days, range totals in USD. Uses only the access granted to the
  configured key; it does not claim company-wide access. This includes calls
  outside Control Center when the key's scope permits. No user/key identities
  or raw gateway logs are exported. See the [official usage contract](https://docs.nexos.ai/gateway-api/usage).
- **Nexos.ai / Control Center:** `model_usage` receipts already recorded by
  the application. Provider-reported tokens and Nexos credits (EUR) only.
  This is not an account-wide Nexos billing export. Missing reports remain
  unknown; failed calls with reported usage are included.
- **Claude / local:** assistant usage in `~/.claude/projects/**/*.jsonl`.
  Repeated streaming records are deduplicated by request/message ID. Input
  includes normal input, cache creation and cache reads. No subscription
  allowance or monetary cost is inferred from these token counts.
- **Claude / quota:** `~/.claude/usage/claude-quota.json`, written by the
  owner's Claude Code status line. Override with `USAGE_CLAUDE_QUOTA_FILE`.
  The reader requires exactly `source`, `observedAt`, `model`, `fiveHour` and
  `sevenDay`. Each window is null or `{usedPercent, resetsAt}`; percentages
  must be finite numbers from 0 to 100, and reset times are ISO timestamps
  or null when unknown. Observed/reset timestamps accept explicit timezone
  offsets and are normalized to UTC. Missing, unreadable, oversized (over
  16 KiB), malformed or future-dated files are unavailable, never zero.
  Observations expire exactly after 15 minutes; each window also expires at
  its reset time. A malformed window invalidates the entire file. No prior
  observation is cached as a fallback. Source/model metadata is validated
  but not exported. The collector logs availability without paths/content.
- **Codex / local:** cumulative `token_count` deltas in `~/.codex/sessions`
  and `archived_sessions`. Duplicate snapshots/copies do not add usage.
  Baselines before the reporting window are subtracted. Counter resets are
  skipped and marked partial. Quota percentages and reset times come only
  from the latest logged provider rate-limit observation.
- **Paperclip:** read-only, date-filtered `/costs/by-provider` aggregates.
  Claude/Anthropic and Codex/OpenAI identify provider families in these
  rows, not proof of a particular CLI runner. Subscription-included costs
  are incremental run charges, not subscription fees. Unpriced/estimated
  usage and unknown-billing zero charges have unknown cost.

The local, Nexos key and Paperclip scopes may overlap. They are displayed separately,
never added into a misleading global total. Cached input is a subset of
input/total tokens. A usage record is not necessarily one network request.
EUR and USD stay separate. Partial logs, missing sources and stale snapshots
are visible; unknown never means zero. Quota observations expire after 15
minutes or their reset time, even if the overall snapshot was just refreshed.
Claude quota needs a current status-line observation; the collector does not
read/copy Claude or Codex login credentials. Token counts cannot establish quota.

## Configure and run

The collector runs on the computer where the clients' logs exist. Its existing
application DB and Paperclip board credentials come from `.env.local`.
It only queries the DB; no migration is needed. Set:

```dotenv
# Private JSON outside public/; point web runtime at the same file if separate.
USAGE_SNAPSHOT_FILE=C:/private/control-center/usage/snapshot.json
USAGE_WINDOW_DAYS=30
USAGE_SYNC_INTERVAL_MS=300000
# Optional absolute override; blank/unset uses the default in ~/.claude/usage/.
USAGE_CLAUDE_QUOTA_FILE=
# Explicit agents that should receive the snapshot. Start with the manager.
USAGE_PAPERCLIP_AGENT_IDS=<manager-agent-uuid>
```

Without a configured file, local development uses `.local/usage/snapshot.json`.
Optional `USAGE_CODEX_ROOTS` and `USAGE_CLAUDE_ROOTS` override log roots; separate
multiple roots with `;` on Windows or `:` on Linux. Only JSONL metadata is
exported, never prompts, responses, tool payloads, file paths or login tokens.
Malformed records and inaccessible logs make the source partial/unavailable.

```powershell
# Collect and inspect without writing to Paperclip:
npm run usage:sync
# Collect and publish to the explicit manager(s):
npm run usage:sync -- --publish
# Keep refreshing and publishing every five minutes while this process runs:
npm run usage:watch
```

Publishing replaces only `BEGIN CONTROL CENTER USAGE` / `END CONTROL CENTER
USAGE` in each selected agent's `AGENTS.md`, preserving everything outside it.
It verifies company membership and submits the previously read content hash;
concurrent changes fail rather than overwrite other edits. An uncertain write
is not blindly retried. The next sync reads the current revision again. The
agent sees the latest snapshot when it next reads its instructions; it does
not retroactively update an already-running model context.

This report is deliberately separate from Paperclip's cost-event ledger:
publishing observations cannot double-charge already-accounted runs, mislabel
EUR as USD, or activate budget enforcement for unknown subscription costs.
The machine must be on and the watch process running for ongoing updates.
The page/API use a validated, atomically replaced snapshot and show stale data
after 15 minutes. They never scan conversation logs during a web request.

## Verification

`tests/shared-usage.test.ts` covers cumulative deltas/window baselines,
copied/streaming duplicate records, cache accounting, quota timestamps,
counter resets, unavailable sources, unknown Nexos prices, currency/billing
separation, preserving agent instructions and optimistic concurrency inputs,
private snapshot validation and stale UI states. Existing owner authorization
also wraps `/api/usage`; production boundary scripts include it.
`tests/claude-quota.test.ts` covers strict status-line file validation, default
and overridden paths, exact expiry/reset boundaries, future observations,
independent windows, unavailable data and consistent Claude/Codex display expiry.

This feature adds no migration. Migration 008 is reserved for Claude's Tool Hub
(`008_tool_calls.sql`); any future shared-usage migration must be numbered after 008.
