# Integration contracts and verification

Reviewed 2026-11-10. Development MCP connections are tools for Codex, not application credentials. No tokens or browser sessions were copied.

## nexos.ai

The [official quickstart](https://docs.nexos.ai/gateway-api/quickstart) documents bearer authentication and `POST https://api.nexos.ai/v1/chat/completions`. The [model catalog](https://docs.nexos.ai/gateway-api/models) provides `GET /v1/models`; use an exact returned ID/name. The server verifies catalog membership before completion.

The [Chat contract](https://docs.nexos.ai/gateway-api/chat) documents streaming, tools, JSON/structured output, usage and per-model parameter differences. This implementation uses a pending, non-streaming response, JSON instructions and strict local validation. It sends no tools or speculative response-format options. It bounds completion tokens, supports timeout/cancellation, never retries or switches providers, and stores only returned usage. Malformed/truncated replies fail validation.

**Unverified with application credentials:** available account models, selected model behavior, completion usage and actual account error behavior. The live completion switch defaults off.

## Paperclip

The [authentication contract](https://docs.paperclip.ing/reference/api/authentication/) distinguishes operator board keys from agent keys and browser sessions. The application supports a separately approved `pcp_board_` operator key obtained through the owner's supported CLI auth flow. This repository creates no credentials.

The adapter targets the documented [Agents API](https://docs.paperclip.ing/reference/api/agents/) and [Issues API](https://docs.paperclip.ing/reference/api/issues/): company-scoped lists/creation, task reads and recent comments. It verifies operator company membership, configured scope, allowed agent IDs, lifecycle readiness and response shapes. Unknown readiness is ineligible. It changes no agent settings, budgets or policies. Successful creation is not execution evidence. Comments are untrusted text; attachments and documents are not yet ingested.

Installed-instance **development MCP** reads verified organization access, roster, task status/comments and canonical prefix-based task links. One existing agent was paused; no ready execution path was established. No tasks or runs were created.

**Still unverified:** installed operator REST authentication and creation/result shapes with separate application credentials. Current docs are an implementation target, not proof of installed compatibility. `PAPERCLIP_CONTRACT_VERIFIED=false` keeps the adapter unavailable. `npm run verify:connections` explicitly probes operator/roster/search and model-catalog reads; it never enables execution. The separately approved bounded test must establish remaining contracts. Missing lifecycle evidence remains a blocker.

REST creation is not assumed idempotent. The MCP request-ID contract does not establish REST behavior. A confirmed run is claimed once in PostgreSQL and carries a stable marker. Uncertain creation is reconciled by read-only marker search plus exact title and assignee matching. Zero/multiple matches remain unresolved; there is never an automatic second POST.

## n8n

The application uses the official instance-level MCP interface with a separate bearer token, the current official TypeScript client, a fixed configured origin and five allowlisted tools. One curated unpublished/manual text-transform contract is implemented. Catalog discovery, strict graph/version verification, owner confirmation, durable request/execution linking, bounded status/result reads and conservative reconciliation share the existing integration and operational database boundaries.

Development MCP reads and the dedicated draft's validation/readback succeeded. Application credentials and a real execution remain unverified. See the [capability matrix, setup, recovery limitations and live gate](PHASE-3.md). There is no general REST execute route, native schedule control, automatic submission retry or Paperclip wrapper.

## States and later adapters

`demo`, `disconnected`, `unavailable` and `verified` are distinct. A URL is insufficient. Successful application checks have timestamps; stale results and errors remain visible. Development MCP success never marks application access verified.

Markdown remains authoritative; no private vault is uploaded or indexed. Knowledge and project memory are the next phase. n8n retains workflow definitions, executions and business schedules; Control Center implements only explicitly reviewed manual requests.

Phase 4 now implements explicitly selected private Markdown knowledge and memory.
Phase 5 adds one gated Paperclip coding adapter using documented issue/isolation
settings and interrupt/cancel controls, plus fixed-origin GitHub source/diff/CI
reads. Read-only development MCP still finds only paused coding capacity. The
application REST creation/workspace/cancellation path and sandbox/budget controls
are unverified. A policy file is operator attestation, not proof that those
controls work. See [Phase 5 capability boundary](PHASE-5.md); leave execution off
until the specific real coding example is separately approved and setup verified.
