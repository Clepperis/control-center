# Independent pre-deployment readiness review

Sanitized for a public repository. No credentials, private addresses, private
knowledge or contents of the local infrastructure audit are reproduced here.

## Verdict

**Not ready for production: concrete blockers remain.** The implementation is
careful and its local checks pass, but no external integration has ever run
against a real service, no deployment packaging exists, and production
authentication has not been tested with a real identity proxy. The code is
ready for _deployment preparation work_ (Phase 6), not for deployment.

## Scope and method

- Audited commit `48dd6e6` on `codex/phase-5-platform-engineer`, the branch that
  contains the real implementation. `main` holds only the initial commit.
- Review branch `claude/pre-deployment-review`, created in a separate Git
  worktree so the owner's active working tree was never modified.
- Read: authentication, HTTP boundary, configuration, database and migration
  code, orchestration, Paperclip/nexos/n8n adapters, automation service,
  knowledge storage/search/citations, the complete Improve System (service,
  executor, repository evidence, planner, safety), the worker, API routes, CI
  workflow and all documents. UI components were exercised through the browser
  suites and captured screens rather than read line by line.
- Environment: Windows 11, Node 24.16, npm 11.13, installed Chrome. Dependencies
  installed with `npm ci` from the existing lockfile; no upgrades.

## Baseline before any change

| Check                   | Result                                                      |
| ----------------------- | ----------------------------------------------------------- |
| `npm run lint`          | pass                                                        |
| `npm run typecheck`     | pass                                                        |
| `npm test`              | pass, 107 tests in 11 files                                 |
| `npm run format:check`  | pass                                                        |
| `npm run build`         | pass (Next 16.4.6 standalone)                               |
| `npm run test:boundary` | pass: built app denies pages/APIs without valid owner       |
| `npm run test:ui:live`  | pass: synthetic operational UI at 1440/1024/390 px with axe |
| `npm audit`             | 0 known vulnerabilities                                     |
| Remote CI on `48dd6e6`  | `Platform validation` concluded success (read through `gh`) |

The application starts in demo mode with only `.env.example` copied to
`.env.local`; no undocumented setup was needed. Live mode cannot be exercised
on this machine: there is no application PostgreSQL, knowledge root, nexos key,
Paperclip key or n8n token configured.

## Feature readiness matrix

"Substitutes" means deterministic in-process replacements (PGlite for
PostgreSQL, fake HTTP services, fixed model replies). They prove application
logic, not external behavior.

| Feature                               | Status                              | Evidence                                                                                                        |
| ------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Authentication and sessions           | Implemented; substitutes only       | `src/server/auth/policy.ts`, `tests/auth.test.ts`, `scripts/verify-boundary.ts`. No real IdP/proxy tested       |
| Dashboard and shell                   | Implemented and verified locally    | `src/components/dashboard.tsx`, `shell.tsx`; demo and synthetic browser suites                                  |
| Chat and model integration            | Implemented; blocked by credentials | `src/integrations/nexos.ts`; no real completion has ever been requested                                         |
| Orchestration persistence             | Implemented; substitutes only       | `src/server/orchestration/*`, `db/migrations/002`; PGlite close/reopen test, never a PostgreSQL server          |
| Confirmations and approvals           | Implemented; substitutes only       | Plan/action hashes, atomic claims; `tests/orchestration.test.ts`, `tests/automations.test.ts`                   |
| Paperclip delegation                  | Implemented; blocked by credentials | `src/integrations/paperclip.ts`; REST contract unverified against the installed version                         |
| n8n automations                       | Implemented; blocked by credentials | `src/integrations/n8n.ts`, `src/server/automations/service.ts`; real MCP client against a test HTTP server only |
| Knowledge storage and editing         | Implemented; verified on local disk | `src/server/knowledge/files.ts`, `service.ts`; real filesystem tests on Windows, not the target volume          |
| Search and citations                  | Implemented; substitutes only       | Lexical all-terms search; revision-bound citations. Answer quality with a real model unverified                 |
| Durable memory                        | Implemented; substitutes only       | Review-hash approval and supersession in `knowledge/service.ts`                                                 |
| Improve System                        | Implemented; blocked by setup       | `src/server/improvements/*`. No coding run, no real GitHub evidence read by the application                     |
| Background worker                     | Implemented; fixed in this review   | `scripts/worker.ts`, `src/server/reconcile.ts`. No service unit or supervisor                                   |
| Production configuration, persistence | Partially implemented               | Standalone build and environment validation exist. No container, unit files, TLS, proxy or secret store         |
| Backup and recovery preparation       | Missing                             | Documents state the requirement only. No backup job, no restore has been performed                              |

## What was verified to be sound

These were checked in code and, where noted, by running the suites. No change
was needed.

- **No development fallback in production.** Development access requires both
  `AUTH_MODE=development` and a development/test `NODE_ENV`, and Next inlines
  `NODE_ENV` at build time. The built artifact refused all three bypass
  attempts in `test:boundary`.
- **Server-side authorization everywhere.** Every route goes through `api()`,
  which resolves the owner first; every query is filtered by `owner_subject`.
  Pages call the owner guard independently of the layout.
- **CSRF.** All mutations are JSON `POST`s requiring an exact `Origin` equal to
  `APP_ORIGIN`, with bounded bodies. This fits a proxy-held browser session.
- **No secrets in public material.** No credentials in tracked files, in the
  history of any branch, or in built client chunks; no `NEXT_PUBLIC_*` usage;
  the private audit and `.env.local` are ignored and were never committed.
- **One-attempt external mutations.** Paperclip task creation, n8n execution
  and coding submission each persist a claim before the request, treat
  timeouts/5xx as uncertain, and reconcile by marker instead of resending.
- **Exact approvals.** Plan, action, policy, candidate, diff and validation
  hashes are compared inside the transaction; a changed plan, target or CI
  result clears review and consent.
- **Knowledge isolation and path safety.** Scope is applied in SQL before any
  passage reaches the model; paths are confined to the root with symlink and
  hard-link checks; concurrent edits produce conflict copies, not overwrites;
  Markdown renders through a small escaped subset.
- **Improve System boundaries.** There is no shell endpoint. Scope excludes
  auth, configuration, approval code, migrations, dependencies and the worker.
  Evidence comes from the GitHub API for the exact commit and requires an
  unchanged validation workflow.

## Findings fixed in this review

All four were reproduced with a failing test before the change.

### P2 — One failing reconciler starved all later ones

`scripts/worker.ts` ran four reconcilers inside a single `try`. If the
knowledge volume was unavailable, `knowledge.tick()` threw on every cycle and
the Improve System step after it never ran. An owner's cancellation of a
running coding task would not be delivered, and the only log line was a generic
failure. Each step now runs independently and the failing step is named
(`src/server/reconcile.ts`). Test: `tests/reconcile.test.ts`.

### P2 — Unbounded polling of validation evidence

A candidate whose CI check failed stayed in `validating` and was re-read every
cycle forever, at roughly eight GitHub API requests per read. A workflow that
never started had the same effect. This breaks the "retry loops have bounds"
requirement and would exhaust the unauthenticated API quota within minutes.
Now a concluded failing check moves the request to `failed`, and checks still
pending after one hour move it to `blocked` with a specific message. The owner
can deliberately re-read evidence with the existing retry action. The existing
test that expected `validating` for a failed check was updated; its purpose
(a failing check can never become review-ready or be approved) is unchanged.
Tests: `tests/improvements.test.ts`.

### P2 — An interrupted chat turn locked its conversation without a worker

A turn left `pending` by a crashed or restarted web process blocked every later
message with "wait for the previous answer" until the worker expired it. With
the worker stopped, the conversation stayed locked permanently. `beginTurn` now
applies the same three-minute bound itself. The interrupted model request is
marked failed and is never repeated. Test: `tests/orchestration.test.ts`.

### P2 — Unexpected server errors were undiagnosable

Any unexpected error was logged as `{"code":"internal"}` only and shown to the
owner as a database problem. The log line now also carries the error class and,
when present, the PostgreSQL SQLSTATE. Messages and stacks are still withheld
because they can contain connection strings. Test: `tests/improvement-http.test.ts`.

## Remaining findings

| #   | Severity | Finding                                                                                                                                                                                                                                                         |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P1       | No live integration has ever run: nexos, Paperclip, n8n, a PostgreSQL server, the target filesystem and a real OIDC proxy are all unverified. Every "connected" path is proven only against substitutes                                                         |
| 2   | P1       | Deployment is not built: no container or service definition, process supervision for web and worker, TLS, secret storage, health endpoint, backup job or tested restore. ARM64 is untested                                                                      |
| 3   | P1       | Before enabling the coding executor: neither `main` nor the improvement target branch is protected on GitHub. The application verifies candidates but cannot stop a credential with push access from writing to the target. Branch protection must enforce this |
| 4   | P2       | `main` contains only the initial commit. Clones and visitors get no application; six stacked `codex/*` branches hold the work. Decide the integration branch before deployment                                                                                  |
| 5   | P2       | Knowledge search requires every query term in one passage. Natural questions with one extra word return nothing. The documentation records this limit; consider ranked any-term matching before relying on grounded answers                                     |
| 6   | P2       | No Content-Security-Policy or HSTS header. Add them at the proxy or in `next.config.ts` during deployment preparation                                                                                                                                           |
| 7   | P3       | The live dashboard always shows knowledge as "not connected", even when the knowledge root works                                                                                                                                                                |
| 8   | P3       | A comment in `scripts/worker.ts` says recovery never calls a model, but Phase 5 planning jobs do call the gateway from the worker when enabled. `docs/ENVIRONMENT.md` describes this correctly                                                                  |
| 9   | P3       | Canonical JSON is implemented twice (`src/server/canonical-json.ts`, `src/integrations/n8n.ts`)                                                                                                                                                                 |
| 10  | P3       | Four UI files and the knowledge service exceed 900 lines. Not a defect; it raises the cost of later changes                                                                                                                                                     |

Items 1–3 are requirements of the product's own documents. Items 5–10 are this
reviewer's recommendations.

## Live versus simulated

Nothing in this review or in the repository's history is live evidence. No
model completion, Paperclip task, n8n execution, coding run, deployment or
restore has been performed. The only real external observations are read-only:
the public repository's branch state and one successful CI run.

## Checks after the changes

| Check                   | Result                                                      |
| ----------------------- | ----------------------------------------------------------- |
| `npm run lint`          | pass                                                        |
| `npm run typecheck`     | pass                                                        |
| `npm test`              | pass, 112 tests in 12 files (107 baseline + 5 new)          |
| `npm run format:check`  | pass                                                        |
| `npm run build`         | pass                                                        |
| `npm run test:boundary` | pass                                                        |
| `npm run test:ui:live`  | pass                                                        |
| `npm run test:ui`       | pass against a local demo server, 1440/390 px               |
| `npm run test:a11y`     | pass: 8 demo routes at 1440/1024/390 px, AA scans, keyboard |

The browser suites are automated checks, not a screen-reader audit or a manual
visual review of every state. Remote CI does not run on `claude/*` branches, so
these results are local only.

## Next actions for the owner

1. Choose the first bounded live test and approve it: a local PostgreSQL
   database with `npm run db:migrate`, then `npm run verify:connections`
   (read-only) with separate application credentials.
2. Protect `main` and the integration branch on GitHub before the coding
   executor is ever enabled.
3. Start Phase 6 as a design: target runtime, identity proxy, secrets,
   supervision of web and worker, backup and a rehearsed restore.
