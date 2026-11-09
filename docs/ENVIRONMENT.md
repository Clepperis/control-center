# Environment and secure setup

Copy `.env.example` to `.env.local` once. Never overwrite existing secrets. All variables below are server-only; do not use `NEXT_PUBLIC_*` credentials. Web server and worker need the same configuration. Production IdP/proxy configuration is separate.

| Variable                                        | Purpose                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `AUTH_MODE`                                     | `development` only with development/test NODE_ENV; otherwise `oidc`   |
| `DATA_MODE`                                     | `demo` fixtures or `live` PostgreSQL; live APIs reject demo mode      |
| `APP_ORIGIN`                                    | Exact browser origin for mutations, without trailing slash            |
| `OIDC_ISSUER`, `OIDC_AUDIENCE`                  | Expected production JWT claims                                        |
| `OIDC_JWKS_URL`                                 | HTTPS signing-key endpoint                                            |
| `OWNER_SUBJECT`                                 | Exact single-owner OIDC subject                                       |
| `DATABASE_URL`                                  | Separate application PostgreSQL connection; configure appropriate TLS |
| `NEXOS_API_KEY`                                 | Separate gateway credential                                           |
| `NEXOS_MODEL`                                   | Exact model catalog ID/name; no default fallback                      |
| `NEXOS_MAX_COMPLETION_TOKENS`                   | 64–4096; default 1200; not a monetary ceiling                         |
| `NEXOS_TIMEOUT_MS`                              | 1000–60000; default 30000 per request                                 |
| `PAPERCLIP_BASE_URL`                            | HTTPS origin only, no embedded credentials/path                       |
| `PAPERCLIP_BOARD_API_KEY`                       | Separately authorized `pcp_board_` operator key                       |
| `PAPERCLIP_COMPANY_ID`                          | Authorized company UUID, never model-selected                         |
| `PAPERCLIP_AGENT_IDS`                           | Allowed agent UUIDs, comma-separated; empty allows none               |
| `PAPERCLIP_CONTRACT_VERIFIED`                   | Exact `true` only after installed-contract verification               |
| `LIVE_MODEL_ENABLED`, `LIVE_DELEGATION_ENABLED` | Exact `true` only after deliberate approval; both default false       |
| `RECONCILE_INTERVAL_MS`                         | 5000–300000; default 30000; at most ten runs/tick                     |

Demo review needs no credentials. Phase 2 needs only application PostgreSQL, nexos and Paperclip setup. n8n, mail, hosting, Telegram and vault access are not required.

Migrations are explicit, transactional and checksum-checked. Add versions rather than edit applied SQL. Application startup does not silently migrate a database. Back up and test restore before production changes.

The production login proxy handles browser sessions, recovery and logout, replaces incoming Authorization headers with signed JWT access tokens, and keeps direct backend access private. `jose` independently verifies algorithm/signature/issuer/audience/required claims/expiry/exact owner. Opaque tokens and identity-only headers are unsupported. Test the selected proxy/IdP before deployment. Changing from `development-owner` to a production owner does not automatically transfer development data.
