# Personal AI Control Center

A self-hostable AI workspace for one owner. The interface is Lithuanian; code and developer documentation are English. Phase 1 provides a polished demo. Phase 2 adds durable conversations and owner-confirmed delegation. Phase 3 adds curated n8n automation. Phase 4 adds private Markdown project knowledge, retrieval, citations and reviewed memory. Phase 5 adds the dedicated Platform Engineer workspace with scoped plans, implementation consent, durable coding delegation, exact candidate evidence and separate manual integration consent. Live model/coding execution verification remains pending.

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

| Command                                | Purpose                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`                          | Loopback development server                                                                 |
| `npm run db:migrate`                   | Explicit, checksum-checked PostgreSQL migrations                                            |
| `npm run worker`                       | Reconciliation/indexing plus explicit durable Phase 5 discussion and authorized coding jobs |
| `npm run knowledge:index -- --rebuild` | Rebuild derived passage indexes from registered private Markdown; no provider calls         |
| `npm run verify:connections`           | Explicit read-only operator/model-catalog probes                                            |
| `npm run verify:n8n`                   | Redacted, read-only application n8n catalog/contract probe                                  |
| `npm run verify:platform`              | Read-only repository/executor-policy readiness check; no coding run                         |
| `npm run usage:sync`                   | Read local Claude/Codex metadata, Nexos receipts and Paperclip usage                        |
| `npm run usage:watch`                  | Refresh shared usage and the configured Paperclip manager every five minutes                |
| `npm run lint` / `npm run typecheck`   | ESLint / TypeScript                                                                         |
| `npm test`                             | PostgreSQL-engine, adapter, state machine and authentication tests                          |
| `npm run test:ui`                      | Demo interactions against a running dev server                                              |
| `npm run test:ui:live`                 | Starts an isolated synthetic operational UI; stop other dev servers first                   |
| `npm run test:boundary`                | HTTP production authentication checks against the built app                                 |
| `npm run format:check`                 | Source/document formatting                                                                  |
| `npm run build` / `npm start`          | Production build / loopback server; development bypass denied                               |

Browser tests default to installed Chrome. Set `BROWSER_CHANNEL=chromium` after `npx playwright install chromium` to use Playwright's matching runtime, or `msedge` for Edge. Generated screenshots and test data remain ignored under `.local`.

The interface uses a compact Linear-inspired dark workspace, with locally bundled Inter, neutral surfaces and grouped work lists. See [design decisions and reference use](docs/DESIGN.md). `npm run test:a11y` checks all pages at 1440/1024/390px, AA rules and keyboard behavior against the running demo server.

Phase 6 adds single-owner password authentication through Better Auth, operator-only bootstrap/recovery, and native ARM64 release, migration, systemd, backup and rollback tooling. Read [Phase 6 operations and approval gates](docs/PHASE-6.md). The selected production mode is `AUTH_MODE=password` with HTTPS and database sessions; explicitly selected legacy OIDC remains supported. A build is not deployment readiness. No production deployment, DNS change or Drive authorization/upload has been performed.

For n8n, follow [Phase 3 configuration and the explicit live-test gate](docs/PHASE-3.md). It uses a separate application MCP token and migration 003. Keep `N8N_EXECUTION_ENABLED=false` until the exact live test is approved. The dedicated example remains an unpublished draft; existing business workflows are never executable automatically.

For knowledge, follow [Phase 4 setup, storage, recovery and validation](docs/PHASE-4.md). Set `KNOWLEDGE_ROOT` to an absolute private directory outside this public checkout, apply migration 004, and run the web app plus worker. Create/select a project in **Žinios**, add Markdown or preview selected imports, then explicitly select that scope in chat. Search needs no model/embedding credentials; chat retains the Phase 2 model approval gate. No private documents are bundled.

For **Tobulinti sistemą**, follow [Phase 5 setup and review](docs/PHASE-5.md), apply migration 005, and use the existing worker. Keep `IMPROVEMENT_EXECUTOR_ENABLED=false` until separate application credentials, a ready Paperclip coding runtime, independently enforced isolation/budget controls and a specific live-run approval exist. The current delivery includes deterministic lifecycle/browser verification, not proof of a real isolated coding run. Integration is a manual exact-commit handoff; deployment belongs to Phase 6.

For shared **Nexos.ai / Claude / Codex usage**, follow [collection, Paperclip awareness and coverage limits](docs/SHARED-USAGE.md). `/statistics` and the owner-only `/api/usage` read the validated private snapshot. Run the collector on the computer with the client logs; `--publish` updates only the configured manager's marked report, preserving its other instructions and existing budgets.

Read [architecture](docs/ARCHITECTURE.md), [validation](docs/VALIDATION.md) and [roadmap](docs/ROADMAP.md) before future work. Keep the full local audit, private infrastructure addresses, personal data, vault and credentials out of this public repository.
