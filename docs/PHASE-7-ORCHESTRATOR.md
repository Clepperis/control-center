# Phase 7 plan: one dispatcher for models, n8n and Paperclip

Status: **plan only**. Nothing here is implemented, approved for live use or
deployed. It builds on Phase 6 (`codex/phase-6-owner-auth-deployment`) and keeps
the owner's decisions of 2026-11-11:

- Keep the custom PostgreSQL orchestrator (no LangGraph) and the custom chat UI.
- The orchestrator proposes **route, plan, model and cost** in one place; the
  owner confirms.
- For n8n the orchestrator may **create, run and improve** workflows.
- Paperclip is driven at **task/goal level**; Paperclip keeps its own internal
  delegation, budgets and agent scheduling (Codex/Claude Code run there).

## Current state (recovered from source)

- `OrchestrationService.submit` makes one gateway call that returns a reply
  `kind`: answer, Paperclip delegation proposal, n8n automation request or memory
  proposal. Confirmation, one-attempt submission and reconciliation already exist.
- One model for everything: `NEXOS_MODEL` in `src/server/config.ts`.
- n8n adapter (`src/integrations/n8n.ts`) allowlists five MCP tools: search,
  details, `execute_workflow`, execution read and execution search. Only one
  curated draft/manual contract is executable. No create/update tools.
- Paperclip adapter creates one issue for an allowed agent after exact consent.
  Application credentials and installed REST contract are unverified; the only
  observed coding agent is paused.
- No shared structured log format and no usage/cost statistics.

## Design

### Route decision

Every chat turn produces one **route card** (Lithuanian UI):

| Field    | Example                                                         |
| -------- | --------------------------------------------------------------- |
| Kas      | Atsakysiu pats / Žinių paieška / n8n automatizacija / Paperclip |
| Kaip     | Short plan (bounded, server-validated)                          |
| Modelis  | Tier and exact nexos model ID, with the reason                  |
| Kaina    | Estimated cost range; actual cost after completion              |
| Veiksmai | Vykdyti / Keisti (route, model or plan) / Atmesti               |

Plain answers within the default tier run immediately (today's behavior). Any
external effect keeps its existing explicit confirmation.

### Model routing (deterministic, not model-chosen)

- A reviewed `model-routing.json` (Zod-validated, outside secrets) maps task
  types to tiers and tiers to exact model IDs from the nexos catalog:
  `chat → fast`, `knowledge → standard`, `planning / improvement → strong`,
  `summary / maintenance → cheapest`.
- Startup and `verify:connections` check every configured ID against
  `GET /v1/models`; unknown IDs disable that tier, never substitute silently.
- Fallback only to the same or a cheaper tier, shown to the owner.
- The strong tier and any turn above a configured cost ceiling require
  confirmation. Owner override is per turn and recorded.
- No LLM router and no Smart Router in this phase.
- Coding model choice stays inside Paperclip agents; Control Center only picks
  the Paperclip target.

### n8n: create, run, improve

Prerequisite: confirm with the application token which workflow-authoring tools
the **installed** n8n MCP server exposes (tools reference + live `tools/list`).
If authoring is not exposed, stop and report; do not fall back to undocumented
REST calls or database writes.

- **Create:** the orchestrator drafts a workflow definition; the server validates
  it (node allowlist, no embedded credentials, no schedules or webhooks unless
  explicitly requested) and creates it **unpublished and inactive**. The owner
  reviews a readable summary plus definition and publishes.
- **Run:** each workflow carries an owner-reviewed **effect class** stored in
  Control Center: `read_only` or `external_effect`. Only `read_only` workflows
  created or reviewed through Control Center may run without per-run
  confirmation. The class is never assigned by the model alone. Everything else
  keeps exact per-run confirmation and the existing unknown-outcome rules.
- **Improve:** a change creates a new draft version with a before/after diff;
  the previous version is retained for rollback. Activation needs owner review.
- Existing Hostinger business workflows not created by Control Center are
  read-only by default; modifying one requires a separate explicit approval per
  change.

### Paperclip: task level

- The route card proposes a Paperclip task with goal, acceptance criteria,
  budget ceiling and optional target agent (default: Paperclip's own routing).
- Control Center tracks status, comments and Paperclip-side approval requests
  and budget, and links to the native task. It does not assign sub-tasks to
  individual Paperclip agents.
- Phase 5 coding safety rules (isolation, no production credentials, separate
  integration consent) stay unchanged.

### Observability

- One structured JSON log line per significant event (route decided, model call
  with tokens/cost, confirmation, external submission, outcome), with request ID
  and no secrets or message bodies.
- A small **Statistika** view: turns, routes, model usage and cost by day, failed
  and unknown outcomes. Langfuse stays deferred.

## Delivery slices

Each slice is a separate branch/PR with tests; live switches stay off.

1. **Structured logs + usage/cost recording.** Migration for usage rows; logger
   module; gateway records tokens/cost. No new external capability.
   _Implemented on `claude/phase-7-usage-logging`:_ `src/server/observability`
   (`log.ts` JSON lines with key redaction and control-character stripping;
   `usage.ts` `trackModelCall` + `DatabaseUsageSink`), migration
   `007_model_usage.sql`, and recording in the chat/knowledge gateway and the
   Platform Engineer planner, including failed calls and tokens spent on replies
   that later fail validation. Verified with deterministic substitutes only
   (fake fetchers, PGlite); no real nexos call has been recorded yet.
2. **Model routing table.** Config schema, catalog check, tier selection,
   fallback, owner override, confirmation for strong tier/cost ceiling.
   _Implemented on `claude/phase-7-model-routing`:_ optional
   `NEXOS_MODEL_FAST/STANDARD/STRONG` (empty uses `NEXOS_MODEL`), fixed
   task→tier map (chat→fast, knowledge→standard, Platform Engineer→strong) in
   `src/server/models/routing.ts`, live catalog check per call, fallback only to
   cheaper tiers, model/tier/fallback persisted with each chat reply and shown
   in the usage line, per-tier status in `verify:connections`. **Deferred to
   slice 3** (needs the route card UI): per-turn owner override and
   confirmation for the strong tier/cost ceiling. Today the strong tier is used
   only by explicit Platform Engineer actions, which the owner already starts.
   Deterministic substitutes only; no real catalog read with application keys.
3. **Route card UI.** Unify existing reply kinds into one card in the chat page,
   preserving the owner's composer/layout changes. Desktop/mobile/a11y checks.
   _Implemented on `claude/phase-7-route-card`:_ each assistant reply shows a
   route summary (Kas / Modelis / Kaina) built from persisted `replyKind`,
   model, tier, fallback and override; a per-message tier picker in the
   composer (automatic / greitas / standartinis / stiprus) is validated by the
   chat API and passed to routing, which still falls back only to cheaper
   tiers. Choosing the strong tier is the owner's explicit confirmation. **Not
   done:** a monetary cost ceiling — nexos prices are not available to the
   application, so only provider-reported tokens/credits after the call are
   shown. Existing plan/automation/memory confirmation cards are unchanged.
4. **Statistika page.** Read-only aggregation over slice 1 data.
   _Implemented on `claude/phase-7-statistics`:_ `/statistics` page and nav
   entry; `src/server/observability/stats.ts` aggregates the last 30 days (1–90
   allowed) of `model_usage` into totals plus per-source, per-model (top 20)
   and per-UTC-day tables of calls, errors, tokens and nexos credits. Server
   rendered behind `requireOwner`; no API route. Demo mode and a missing
   database/migration show an explicit "unavailable" notice, never zeros.
   Turn/run failure statistics beyond model calls are not included.
5. **Paperclip task-level proposals.** Goal/budget/target fields, status and
   approval display. Requires verified application credentials first.
   _Implemented on `boss/paperclip-task-proposals` (deterministic substitutes
   only; no real Paperclip call, credentials still unverified):_ the plan carries
   `budgetCeiling` (EUR, 0.01–10000, required on model proposals, optional when
   reading older stored plans); goal = `objective`, acceptance criteria =
   `completionCriteria`, target agent = `agentId` (null: Paperclip routes the
   task itself and the unassigned proposal is confirmable). The ceiling is
   written into the issue description; Paperclip-side enforcement is not
   assumed. The run card shows status, comments, approvals read from
   `GET /issues/:id/approvals` and the native link; unreadable approvals and the
   missing Paperclip budget-usage contract are shown as explicit notices.
   Confirmation, one-attempt and unknown-outcome rules are unchanged.
6. **n8n authoring capability check.** Read-only `tools/list` probe with the
   application token; document results. Gate for slices 7–9.
   _Done 2026-11-11 with the owner's application MCP token (read-only
   `tools/list`, no tool called):_ the installed instance exposes 64 tools.
   Authoring is available: `get_workflow_sdk_reference`, `validate_workflow`,
   `validate_node_config`, `create_workflow_from_code`, `update_workflow`,
   `get_workflow_history`, `get_workflow_version`, `get_workflow_versions_diff`,
   `restore_workflow_version`, `publish_workflow`/`unpublish_workflow`,
   `test_workflow`, `archive_workflow`, plus execution reads. Slices 7–9 are
   therefore feasible through the official MCP interface; the application
   allowlist still exposes only the five Phase 3 tools until those slices add
   reviewed ones. The token also reaches credential listing, data tables,
   folders and n8n Agents with the owner's native permissions; a dedicated
   lower-privilege n8n user is recommended before enabling writes.
7. **n8n create (draft only)** with validation and owner publish.
8. **n8n effect classes and run policy.**
9. **n8n improve** with versioned drafts, diff and rollback.

## Owner-only steps

- Create application credentials (n8n MCP token, Paperclip board key, nexos key)
  and place them in `.env.local` or the server secret store yourself. Never paste
  them into chat.
- Choose cost ceilings and approve the model tier table.
- Approve each first live run (paid model call, real n8n create/run, real
  Paperclip task) separately.

## Acceptance

- Every slice: `npm run lint`, `typecheck`, `test`, `format:check`, relevant UI
  and a11y scripts pass; deterministic substitutes are labeled as such.
- No live switch is enabled by default; no credential appears in Git, logs or
  client bundles.
- Live verification is recorded separately from deterministic tests, per the
  project's state categories.

## Open questions

- Which exact nexos models per tier (needs a catalog read with the app key).
- Default cost ceiling per turn and per day.
- Whether `read_only` n8n runs should also have a daily count limit.
