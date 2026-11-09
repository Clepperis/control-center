# Phase 2: durable bounded delegation

## Implemented architecture

Guarded same-origin HTTP saves an owner conversation and unique turn before requesting a model response. The model returns an ordinary answer or one validated bounded proposal: objective, task, eligible agent, completion criteria and constraints. Fixed server restrictions and an immutable digest bind owner confirmation to the reviewed content.

Confirmation rechecks readiness, atomically claims the proposal and submits one Paperclip task. Subsequent reads project real external status and comments into the dashboard/chat. Model output never selects credentials, organizations, endpoints, execution configuration or executable shell arguments. Reviewed task descriptions are work data, not authority to bypass Paperclip policies.

One model request plus one delegation does not currently need LangGraph. A small explicit PostgreSQL state machine solves the required durability without a second runtime. Domain transitions stay isolated so a graph can be added when branching complexity warrants it. Neither a browser connection nor an in-memory promise owns the lifecycle.

| State                   | Meaning                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `awaiting_confirmation` | Immutable proposal; no task                                             |
| `delegating`            | Owner/time recorded; one creation attempt claimed                       |
| `delegated`             | External task known; execution not established                          |
| `running` / `review`    | Paperclip reports `in_progress` / `in_review`                           |
| `completed`             | Paperclip reports `done`; owner must still assess results               |
| `blocked`               | Agent unavailable, creation uncertain, external block or unknown status |
| `failed`                | Definite rejected creation, not inferred execution failure              |
| `cancelled`             | Proposal rejected or Paperclip reports cancellation                     |

`backlog` and `todo` do not prove scheduling/execution. Raw external status remains visible. No synthetic metrics or semantic acceptance verdicts are generated.

## Recovery and duplicate prevention

- Unique request IDs/input hashes prevent changed-content replay. PostgreSQL permits only one pending turn per conversation. Existing turns are retrieved without repeating model calls.
- Immutable proposal hashes and atomic confirmation claims prevent duplicate creates, including simultaneous clicks.
- Ambiguous POSTs are never retried. Read-only marker/title/assignee reconciliation attaches exactly one match; zero/multiple matches require manual resolution before new work.
- A separate `npm run worker` loop reconciles at most ten runs per tick using bounded HTTP requests and database leases, with no model/creation path. Failed attempts rotate fairly. Missing gateway configuration does not prevent recovery.
- After restart, model turns older than three minutes become interrupted; creation claims older than 90 seconds become uncertain. Paid requests are not replayed. Missing Paperclip setup still permits interrupted-turn recovery.
- Read errors preserve the last external observation. Last-success timestamps and 90-second freshness labels prevent stale activity appearing current. Terminal observations are retained; externally reopened work requires review.
- Rejecting an unconfirmed proposal cancels locally. Stopping after confirmation disables automatic tracking only, explicitly leaving external work unchanged. Manual read remains possible.

The reconciler is not a business scheduler; n8n retains that responsibility. Results include up to 20 recent comments, not every document, attachment or trace. No per-task Paperclip cost ceiling is verified. Existing external budgets must be established before delegation. Gateway output limits are not exact monetary limits.

Tests use PGlite as a PostgreSQL engine with the real migrations and an on-disk close/reopen test. Synthetic services exist only in tests. The app uses `pg` and requires a PostgreSQL server; PGlite is not a production fallback. Conventional PostgreSQL-server and ARM64 runtime verification remain pending.

## Live test pending

No live completion or agent task was executed. Minimum setup: local application PostgreSQL, separate nexos key/exact model, separate Paperclip operator key/company/allowed agent, verified installed contract and readiness. Secrets belong in ignored `.env.local` or an approved store, never in chat.

Keep live switches off for read-only probes. Then request explicit approval for one concrete test, naming synthetic input, selected ready agent, task, side effects, enforceable limits and verification. Suggested input: “Review this fictional sentence and return exactly one suggested edit; do not use external tools or change files.” Gateway output can be limited to 1,200 tokens; agent budget limits must already be enforced in Paperclip. Verify persisted approval, external ID/status/comments, repeated-confirmation deduplication and restart recovery. Without readiness or enforceable budget bounds, keep the live test blocked.

After these blockers are resolved, the next product phase is n8n automation integration.
