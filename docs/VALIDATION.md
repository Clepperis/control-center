# Validation record

## Phase 1 foundation

Validated locally on Windows with Node 24.16 and installed Chrome:

- ESLint and TypeScript pass.
- Authentication tests verify explicit development mode, production denial, JWT signature/issuer/audience/expiry and exact owner identity.
- Production Next.js build passes. Windows sandbox subprocess restrictions required running checks outside the sandbox; no code workaround was needed.
- Browser review at 1440px and 390px: all eight pages, no horizontal overflow, dialogs, review persistence after reload, chat draft persistence, task filtering, mobile menu navigation and reset pass. No browser runtime errors.
- Local screenshots are ignored under `.local/screenshots`.
- `npm audit` reports no vulnerabilities after scoped development-tool glob patches. Some upstream ESLint plugins still advertise ESLint 9 peer ranges; the installed ESLint 10 passes the actual lint command.

No production deployment or ARM64 runtime validation has been performed. Real integrations and a live end-to-end run are outside Phase 1.

## Phase 2

- ESLint, TypeScript and the production build pass.
- 32 deterministic tests pass: persisted conversations/proposals/confirmations/external IDs across actual database close/reopen, repeatable migrations, exact approval, simultaneous confirmation deduplication, changed-request rejection, interrupted-turn recovery, ambiguous creates with zero/one/multiple matches, actual status mapping, local-only tracking stop, stale reads, provider errors, cancellation and conservative readiness checks.
- PGlite executes the real PostgreSQL migrations. HTTP/service substitutes exist only in tests; they do not prove account compatibility.
- Synthetic operational browser test passes at 1440px and 390px: persisted proposal, explicit confirmation, one create, real state-machine updates, displayed results, stopped local tracking, unavailable storage, origin rejection and navigation. No unexpected console/runtime errors. Desktop/mobile screenshots were visually reviewed and stay local.
- Demo browser checks pass across all eight pages, with review/draft persistence, filters, dialog behavior, mobile navigation and reset.
- Production HTTP checks deny pages/data/mutations without valid owner auth. The compiled production artifact rejects development bypass even if runtime NODE_ENV is changed to test. JWT unit tests cover signature/issuer/audience/expiry/exact owner.
- Full `npm audit` reports zero vulnerabilities. Formatting checks pass. Private audit/environment files and generated data are ignored; staged content was checked for private infrastructure identifiers and credential patterns.

**Not verified:** live model completion, installed Paperclip REST write/result contract with application credentials, agent execution, conventional PostgreSQL-server connectivity, real production IdP/proxy, or ARM64 runtime. Separate application credentials are missing and a ready agent has not been established. No live model calls, external task creation, workflow executions, deployments or infrastructure changes were performed. Follow [the concrete remaining setup/test steps](PHASE-2.md).
