# Personal AI Control Center

A self-hostable AI workspace for one owner. The interface is Lithuanian; code and developer documentation are English. Phase 1 provides a polished demo. Phase 2 adds durable conversations and owner-confirmed delegation. Phase 3 adds curated, owner-confirmed n8n automation with durable execution visibility. Live account execution verification remains pending.

## Local demo

Requires Node 22.13+ (Node 24 LTS recommended) and npm.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open [the local workspace](http://127.0.0.1:3000). On Linux/macOS use `cp .env.example .env.local`. Do not overwrite an existing environment file. Default `AUTH_MODE=development` and `DATA_MODE=demo` explicitly enable local development access and isolated fictional data. No database or remote service is needed for demo review. Explore eight pages, decisions, local drafts, task filtering and reset.

## Operational mode

Use your own local PostgreSQL database, separate from Paperclip/n8n databases. Set `DATA_MODE=live` and `DATABASE_URL` in the ignored `.env.local`:

```powershell
npm run db:migrate
npm run dev
# Another terminal, same configuration:
npm run worker
```

The live UI identifies missing setup and never substitutes demo data. Read [integration verification](docs/INTEGRATIONS.md), [environment variables](docs/ENVIRONMENT.md) and [Phase 2 behavior](docs/PHASE-2.md) before enabling live switches. Credentials belong only in `.env.local` or an approved secret store, never in chat. Application access is separate from Codex MCP/OAuth access.

## Commands

| Command                              | Purpose                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `npm run dev`                        | Loopback development server                                                           |
| `npm run db:migrate`                 | Explicit, checksum-checked PostgreSQL migrations                                      |
| `npm run worker`                     | Bounded reconciliation and interrupted-turn recovery; no model calls or task creation |
| `npm run verify:connections`         | Explicit read-only operator/model-catalog probes                                      |
| `npm run verify:n8n`                 | Redacted, read-only application n8n catalog/contract probe                            |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript                                                                   |
| `npm test`                           | PostgreSQL-engine, adapter, state machine and authentication tests                    |
| `npm run test:ui`                    | Demo interactions against a running dev server                                        |
| `npm run test:ui:live`               | Starts an isolated synthetic operational UI; stop other dev servers first             |
| `npm run test:boundary`              | HTTP production authentication checks against the built app                           |
| `npm run format:check`               | Source/document formatting                                                            |
| `npm run build` / `npm start`        | Production build / loopback server; development bypass denied                         |

Browser tests use installed Chrome (`BROWSER_CHANNEL=msedge` selects Edge). Generated screenshots and test data remain ignored under `.local`. Restricted Windows environments may require subprocess permission for tests/builds.

The interface uses a compact Linear-inspired dark workspace, with locally bundled Inter, neutral surfaces and grouped work lists. See [design decisions and reference use](docs/DESIGN.md). `npm run test:a11y` checks all pages at 1440/1024/390px, AA rules and keyboard behavior against the running demo server.

Production requires a trusted OIDC login/session proxy plus independent signed-JWT owner verification. A production build alone is not deployment readiness. No deployment or remote infrastructure changes are included.

For n8n, follow [Phase 3 configuration and the explicit live-test gate](docs/PHASE-3.md). It uses a separate application MCP token and migration 003. Keep `N8N_EXECUTION_ENABLED=false` until the exact live test is approved. The dedicated example remains an unpublished draft; existing business workflows are never executable automatically. Knowledge and project memory are next.

Read [architecture](docs/ARCHITECTURE.md), [validation](docs/VALIDATION.md) and [roadmap](docs/ROADMAP.md) before future work. Keep the full local audit, private infrastructure addresses, personal data, vault and credentials out of this public repository.
