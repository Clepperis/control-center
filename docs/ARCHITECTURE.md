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

The Improve System role will use a bounded task, isolated checkout and execution environment, tests, a reviewable diff, and explicit production approval. A Git branch alone is not execution isolation. Investment functionality is deferred.

## Research interpretation

The private local audit is research and decision history, not an installation specification. Its current access findings supersede older disconnected findings. Development MCP access does not authenticate this application. LangGraph, assistant-ui, Better Auth, vector databases, queues, and additional memory engines were candidates, not confirmed dependencies. None is necessary for the Phase 1 foundation.

## Authentication boundary

`AUTH_MODE=development` grants a clearly labeled local owner only with `NODE_ENV=development` or `test`. The documented dev server binds to loopback. Production never falls back to this mode.

The intended production setup is a trusted OIDC login proxy in front of the application, with HTTPS and direct backend access blocked. The proxy handles the browser session, login and recovery and replaces any incoming Authorization header with the owner's signed JWT access token. The application independently verifies signature, algorithm, issuer, audience, expiry, issued-at and exact `OWNER_SUBJECT` using `jose` and the configured HTTPS JWKS URL. Ordinary identity headers are not trusted. Opaque access tokens are unsupported. Each server page and API operation must call the owner guard before reading data. Configuration alone does not verify a production installation; test the chosen IdP and proxy before deployment.

The Phase 1 UI does not have production authentication configuration or a login screen. It fails closed with setup guidance. There is no public registration, custom password storage or multi-tenant model.

## Self-hosting

Phase 2 adds `src/server/orchestration` (durable state machine), `src/server/db` (PostgreSQL/migrations), guarded `src/app/api` handlers and server-only adapters. Mutations enforce exact configured origin, JSON/body limits and owner identity. The separate worker reconciles status and cannot call models or create tasks. See [Phase 2 decisions](PHASE-2.md).

Use a supported Node LTS on Linux ARM64, a reverse proxy and PostgreSQL when operational state is enabled. Next standalone output is prepared, but the ARM64 runtime has not been tested and no deployment has been performed. Do not copy a Windows `node_modules` directory onto Linux; install/build for the target platform. Resource limits, TLS, secret storage, backups, and restore tests are deployment prerequisites, not completed work.
