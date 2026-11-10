# Architecture and decisions

One owner, one modular TypeScript application. Next.js App Router and React provide the responsive web UI and server boundary. Tailwind design tokens, shared components, native form controls, and Radix Dialog provide the component system. No remote fonts, analytics, or image services are needed to review the UI.

## Responsibilities

| Owner               | Responsibility                                                                |
| ------------------- | ----------------------------------------------------------------------------- |
| Control Center      | Conversations, orchestration records, owner decisions, project references     |
| Custom orchestrator | Bounded planning, delegation, outcome checks                                  |
| Paperclip           | Delegated tasks, scheduling, agent execution, budgets and execution approvals |
| n8n                 | Automation executions and business schedules                                  |
| Markdown files      | Authoritative approved knowledge; use a separate private vault                |
| PostgreSQL          | Operational state and rebuildable search projections                          |
| nexos.ai            | Intended server-side model gateway                                            |
| Obsidian            | Optional Markdown editor                                                      |

`src/components` contains UI. `src/domain` contains models. `src/data` isolates replaceable dashboard access and fictional fixtures. `src/server` contains authentication and future operations. `src/integrations` defines domain-facing adapter boundaries. Credentials never belong in client components or `NEXT_PUBLIC_*` variables.

The Improve System role uses a bounded task, isolated checkout and execution environment, tests, a reviewable diff, and separate implementation/integration consent. Deployment is reserved for Phase 6. A Git branch alone is not execution isolation. Investment functionality is deferred.

## Research interpretation

The private local audit is research and decision history, not an installation specification. Its current access findings supersede older disconnected findings. Development MCP access does not authenticate this application. LangGraph, assistant-ui, Better Auth, vector databases, queues, and additional memory engines were candidates, not confirmed dependencies. None is necessary for the Phase 1 foundation.

## Authentication boundary

`AUTH_MODE=development` grants a clearly labeled local owner only with `NODE_ENV=development` or `test`. The documented dev server binds to loopback. Production never falls back to this mode.

The selected Phase 6 production path is `AUTH_MODE=password`: Better Auth verifies the owner password and signed session cookie, and reads the PostgreSQL session on every guarded request. An operator creates the sole account; a database singleton constraint prevents another. The stable user ID must equal the explicitly configured `OWNER_SUBJECT`. Ordinary identity/proxy headers do not authenticate ownership. Each server page and API operation calls the owner guard before data access. Cookie caching is disabled, sessions have a fixed 12-hour lifetime, logout deletes the session, and operator reset revokes all sessions. See [authentication and deployment details](PHASE-6.md).

Explicit legacy `AUTH_MODE=oidc` retains independent `jose` verification of signature/algorithm/issuer/audience/required claims/expiry/exact owner. It is never a password-mode fallback. Production artifacts deny development access even with runtime NODE_ENV=test. There is no public registration or automatic transfer of `development-owner` records.

The reviewed deployment design puts web, the existing worker, dedicated PostgreSQL, authoritative private Markdown/history and backup scratch on Oracle. n8n/Paperclip and their databases stay on Hostinger behind supported HTTPS APIs. Native immutable Linux ARM64 releases use systemd; no additional agent platform, queue, scheduler or deployment API is introduced. The existing Oracle workloads remain independent.

## Self-hosting

Phase 5 adds `src/server/improvements` to the existing application and worker.
PostgreSQL owns request conversations, versioned plans, exact owner consent,
leases and private evidence. One Paperclip coding adapter requests fixed isolated
workspace settings under operator-verified sandbox limits. A fixed-origin GitHub
read adapter supplies pinned source context and actual candidate/CI evidence.
The worker may call the gateway only for explicit durable Phase 5 discussion/
investigation jobs, and may create one task only after exact implementation
consent. Phase 2 reconciliation still cannot invoke its gateway or create tasks.
Owner self-review and manual exact-commit integration consent remain separate;
there is no deploy API. See [Phase 5 boundaries and blockers](PHASE-5.md).

Phase 4 adds `src/server/knowledge` to the existing application and worker.
Private Markdown outside the checkout is authoritative; immutable file revisions
back server-generated citations. PostgreSQL owns project/owner metadata,
rebuildable lexical passage indexes and explicit memory proposal/approval state.
Knowledge turns offer no tools and filter scope before providing untrusted
reference data to the existing gateway. Obsidian remains optional. See
[Phase 4 decisions, recovery and limitations](PHASE-4.md).

Phase 3 extends `AutomationAdapter` and the existing worker with `src/server/automations`. Control Center owns immutable reviewed requests; n8n remains authoritative for workflows, execution status and schedules. One fixed-origin official MCP client covers catalog, manual execution and status/result reads with separate application credentials. Atomic approval claims and correlation-based read recovery never resubmit an uncertain action. Chat and the automation catalog use the same service; no Paperclip wrapper or second orchestration framework is introduced. See [Phase 3 evidence and limitations](PHASE-3.md).

Phase 2 adds `src/server/orchestration` (durable state machine), `src/server/db` (PostgreSQL/migrations), guarded `src/app/api` handlers and server-only adapters. Mutations enforce exact configured origin, JSON/body limits and owner identity. The separate worker reconciles status and cannot call models or create tasks. See [Phase 2 decisions](PHASE-2.md).

Use a supported Node LTS on Linux ARM64, a reverse proxy and PostgreSQL when operational state is enabled. Next standalone output is prepared, but the ARM64 runtime has not been tested and no deployment has been performed. Do not copy a Windows `node_modules` directory onto Linux; install/build for the target platform. Resource limits, TLS, secret storage, backups, and restore tests are deployment prerequisites, not completed work.
