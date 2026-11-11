# Environment and secure setup

Copy `.env.example` to `.env.local` once. Never overwrite existing secrets. All variables below are server-only; do not use `NEXT_PUBLIC_*` credentials. Production web/worker/operator configuration is deliberately separated; see `ops/config/*.env.example` and [Phase 6](PHASE-6.md).

| Variable                                            | Purpose                                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `AUTH_MODE`                                         | `development` only in development/test; selected production `password`; explicit legacy `oidc` |
| `DATA_MODE`                                         | `demo` fixtures or `live` PostgreSQL; live APIs reject demo mode                               |
| `APP_ORIGIN`                                        | Exact browser origin for mutations, without trailing slash                                     |
| `OIDC_ISSUER`, `OIDC_AUDIENCE`                      | Expected production JWT claims                                                                 |
| `OIDC_JWKS_URL`                                     | HTTPS signing-key endpoint                                                                     |
| `OWNER_SUBJECT`                                     | Stable single-owner identity; password user ID must match, never `development-owner`           |
| `AUTH_SECRET`                                       | Random >=32-character Better Auth secret; production web and operator only                     |
| `OPERATOR_DATABASE_URL`                             | Interactive account bootstrap/reset role; never web/worker/executor                            |
| `MIGRATION_DATABASE_URL`                            | Explicit production migration role; never web/worker/executor                                  |
| `RELEASE_COMMIT`                                    | systemd-provided exact immutable release SHA; worker/readiness must agree                      |
| `DATABASE_URL`                                      | Separate application PostgreSQL connection; configure appropriate TLS                          |
| `NEXOS_API_KEY`                                     | Separate gateway credential                                                                    |
| `NEXOS_MODEL`                                       | Exact model catalog ID/name; no default fallback                                               |
| `NEXOS_MODEL_FAST` / `_STANDARD` / `_STRONG`        | Optional tier models for chat / knowledge / Platform Engineer; empty uses `NEXOS_MODEL`        |
| `NEXOS_MAX_COMPLETION_TOKENS`                       | 64–4096; default 1200; not a monetary ceiling                                                  |
| `NEXOS_TIMEOUT_MS`                                  | 1000–60000; default 30000 per request                                                          |
| `PAPERCLIP_BASE_URL`                                | HTTPS origin only, no embedded credentials/path                                                |
| `PAPERCLIP_BOARD_API_KEY`                           | Separately authorized `pcp_board_` operator key                                                |
| `PAPERCLIP_COMPANY_ID`                              | Authorized company UUID, never model-selected                                                  |
| `PAPERCLIP_AGENT_IDS`                               | Allowed agent UUIDs, comma-separated; empty allows none                                        |
| `PAPERCLIP_CONTRACT_VERIFIED`                       | Exact `true` only after installed-contract verification                                        |
| `LIVE_MODEL_ENABLED`, `LIVE_DELEGATION_ENABLED`     | Exact `true` only after deliberate approval; both default false                                |
| `RECONCILE_INTERVAL_MS`                             | 5000–300000; default 30000; at most ten runs/tick                                              |
| `N8N_ORIGIN`                                        | HTTPS origin only; the fixed MCP path is appended server-side                                  |
| `N8N_MCP_TOKEN`                                     | Separate application MCP personal token; never Codex OAuth or a REST key                       |
| `N8N_TIMEOUT_MS`                                    | 1000–15000; default 8000 per MCP call, including handshake                                     |
| `N8N_TEXT_WORKFLOW_ID`, `N8N_TEXT_WORKFLOW_VERSION` | Reviewed dedicated draft ID and exact version UUID; both or neither                            |
| `N8N_EXECUTION_ENABLED`                             | Exact `true` only after explicit live-action approval; default false                           |

Demo review needs no credentials. Phase 2 needs only application PostgreSQL, nexos and Paperclip setup. n8n, mail, hosting, Telegram and vault access are not required.

Phase 5 uses `IMPROVEMENT_EXECUTOR_ENABLED` (default false), the explicit allowed
`IMPROVEMENT_REPOSITORY` and `IMPROVEMENT_TARGET_BRANCH`, an optional separate
`IMPROVEMENT_GITHUB_READ_TOKEN` (Contents/Actions read only), and
`IMPROVEMENT_POLICY_FILE` (absolute operator-owned file outside the checkout and
agent filesystems). These do not grant runtime or deployment credentials. The
existing worker now handles explicit Phase 5 model/planning jobs and exactly
authorized task submission, while earlier reconciliation paths retain their
read-only behavior. Read [policy verification, isolation and disabling](PHASE-5.md).

Phase 4 additionally uses server-only `KNOWLEDGE_ROOT`: an absolute, private,
persistent Markdown directory outside the public checkout and its parents.
Web and worker must share it. There is no default vault, folder scanning,
Obsidian dependency or embedding credential. Use migration 004 and read
[storage permissions, import limits and recovery](PHASE-4.md). Missing knowledge
configuration leaves ordinary chat available and explicitly ungrounded.

Phase 3 adds n8n only for its automation path. See [secure setup and the live gate](PHASE-3.md). All discovered workflows are read-only unless the dedicated contract matches. n8n's connection check is a real authorized read; a configured URL is not a verified connection. The worker handles at most three automation requests per tick in addition to Phase 2 reconciliation; it never submits an automation.

Migrations are explicit, transactional and checksum-checked. Add versions rather than edit applied SQL. Application startup does not silently migrate a database. Back up and test restore before production changes.

Password mode uses HTTPS `APP_ORIGIN`, the application PostgreSQL, `AUTH_SECRET` and explicit `OWNER_SUBJECT`. Missing/invalid setup fails closed. Web receives the runtime DB role; worker receives its separate DB role and no authentication secret. The coding executor receives none of these. Legacy OIDC still requires its documented trusted proxy and independent JWT verification. Changing identities never transfers existing data or approval records.
