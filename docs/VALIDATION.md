# Validation record

## Phase 4

Validated locally on Windows, Node 24.16 and installed Chrome:

- 80 tests pass across 7 suites, including the earlier chat/Paperclip/n8n
  regressions. New tests execute real PostgreSQL migrations in PGlite, real
  Markdown storage, external/concurrent edit conflicts, junction/traversal
  rejection, preview/duplicate imports, incremental indexing/rebuild,
  archived/missing source removal, immutable citations and 410 behavior, memory
  approval/conflict acknowledgement/supersession, and actual database close/reopen.
- Real knowledge HTTP handlers are exercised with an explicitly substituted
  authenticated owner/database factory, including origin/body/schema/ownership
  checks. Gateway transport tests keep injected source text separate from system
  instructions. Knowledge-turn tool proposals are rejected by server policy.
- The synthetic operational browser suite verifies project/document creation,
  inert Markdown, project-isolated search, import preview/confirmation, pending
  memory review and approval, clicking an answer's citation after the source
  changes, and recoverable archive/restore. AA axe scans and reflow pass at
  1440/1024/390px. Desktop/mobile captures were visually inspected. Model and
  browser-service transport are deterministic substitutes, not live quality proof.
- Existing demo interactions and all eight demo-route accessibility scans pass.
  Existing Paperclip and n8n synthetic browser scenarios pass. Production HTTP
  checks deny unauthorized reads/mutations, including the new knowledge routes.
- ESLint, TypeScript, formatting and optimized production build pass. Runtime
  private-volume access opts out of asset tracing; explicit exclusions and the
  production boundary script verify no audit/environment/private/local-data files
  enter standalone traces or the artifact root. Generated builds stay ignored.
- The LT/EN fixture records 8/8 chosen positive lexical matches, isolated Harbor
  and explicit-global results, and a demonstrated paraphrase miss. See the exact
  queries and limitations in [Phase 4](PHASE-4.md).

No private documents, embeddings, real model completions, deployments or paid
indexing were used. Local application PostgreSQL, private `KNOWLEDGE_ROOT`,
`NEXOS_API_KEY` and exact `NEXOS_MODEL` are not configured; model calls remain
disabled. A real grounded-answer test still requires those settings and explicit
approval of the selected synthetic source, provider destination and bounded call.
Conventional PostgreSQL-server, eventual filesystem/ARM64 and production backup/
restore remain unverified. Next is the dedicated Improve System agent.

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

## Phase 2.5

- Actual before/after captures were reviewed at 1440px, 1024px and 390px using matching demo and synthetic conversation states. Self-contained HTML/PNG comparisons and the original captures remain ignored under `.local/phase-2-5`.
- All eight demo routes at three widths, decision dialog and mobile drawer have zero axe A/AA-tagged violations. Keyboard checks pass for skip links, focus trapping/return, fallback after removing a reviewed decision, mobile navigation and reduced motion. There was no page-level horizontal overflow.
- The updated synthetic live suite passes, including proposal/result accessibility scans, keyboard expansion, retained expansion after refresh, exact confirmation, one task creation, status/results, errors and local-only stop. No unexpected browser console/runtime errors were recorded. The composer was corrected to normal flow after visual inspection showed sticky positioning could cover the plan.
- Lint, type-check, 32 deterministic tests, production build, production-artifact authentication boundary, formatting and full dependency audit pass. The audit reports zero vulnerabilities.
- No server, integration, domain or migration behavior was changed. New dependencies are limited to a development accessibility test tool. Secrets, the private audit and third-party reference images were excluded from the public commit.

Automated checks are not a complete screen-reader or assistive-technology audit. Live integrations, production identity-provider configuration and ARM64 testing retain the Phase 2 limitations above. This phase makes no deployment or remote application-setting changes.

## Linear redesign follow-up

- Rebuilt the presentation against the exact owner-supplied Linear dark list reference. Actual dashboard, project/task list, demo chat, settings and synthetic proposal/result captures were reviewed at desktop, intermediate and mobile sizes. Local before/after boards and captures remain ignored under `.local/phase-2-5/linear-*`.
- All eight demo routes at 1440/1024/390px pass the AA-tagged axe scans and horizontal-overflow checks. Skip links, dialog focus/trapping/return, removed-trigger fallback, mobile drawer and reduced motion pass.
- Demo browser checks pass, including the new overview filters, task pill filters, mobile page-information disclosure bounds, review/draft persistence and reset. The synthetic operational suite passes exact confirmation, single delegation, status/results, preserved row expansion and local-only tracking stop. No unexpected browser console/runtime errors were recorded.
- Lint, explicit type-check, all 32 deterministic tests, the final production build, production-artifact authentication boundary and formatting pass. Development bypass is still rejected in a production build, including when runtime `NODE_ENV=test`.
- The sole new runtime dependency is a locally bundled Inter font, including Lithuanian characters. Full dependency audit reports zero vulnerabilities. No remote font requests, live model calls, external task/workflow creation, deployment or remote configuration changes were introduced.
- Public changes contain sanitized source/documentation only. Audit files, environment configuration, generated captures and reference research remain local and ignored.

The result is visually similar to the supplied reference, not a verified pixel-identical copy. Live integration and deployment limitations above remain unresolved by this visual work.

## Phase 3 n8n automation

- Built from `codex/linear-design-refinement`, preserving the earlier phase commits and the Linear design. The initial lint/type/test baseline passed. Relevant installed Next.js route-handler and server/client documentation was read before framework changes.
- Development n8n MCP discovery/execution-list reads succeeded. The dedicated two-node text-transform draft was node-validated, workflow-validated, created and read back unpublished/inactive with no credentials. Its execution list remains empty. No publication, schedule, business workflow or model call occurred.
- All 63 deterministic tests pass. Coverage includes the real MCP client with test-only HTTP, configuration/permissions, strict input/definition checks, proposal-specific canonical approval digests across JSONB round trips, expiry, concurrent clicks, no submission retry, correlation reconciliation, zero/multiple matches, actual engine close/reopen, native statuses, result bounds, ownership and the shared chat service.
- Production build, explicit type-check, lint and formatting pass. Production HTTP tests deny automation catalog reads and confirmation mutations without valid owner authentication, including the attempted production development bypass with runtime `NODE_ENV=test`. Development HTTP checks also reject foreign origins on both automation mutation routes.
- The synthetic operational browser suite passes the n8n catalog → review → confirmation → acceptance → status/result path using the production adapter/service against isolated substitutes. It also covers persisted reload, ambiguous acceptance and reconciliation without another submit, chat proposals, local-only tracking stop and authorization errors. The earlier Paperclip scenario still passes. No unexpected browser console/runtime errors were recorded.
- Desktop/intermediate/mobile captures were reviewed at 1440/1024/390px and remain ignored in `.local/phase-3`. The new operational confirmation/result views have zero AA-tagged axe violations and no horizontal overflow. All eight demo routes and the existing keyboard/focus/mobile checks also pass. These checks are not a complete assistive-technology audit.
- Full dependency audit reports zero vulnerabilities. Public changes were restricted to sanitized source, example workflow code, migrations and documentation; the local audit, environment, handoff and screenshots remain ignored.

**Live gate remains blocked:** local application PostgreSQL and n8n application credentials/configuration are absent. `npm run verify:n8n` exits with the redacted `configuration` code before making an external request. Exact installed-version verification is also outstanding because automatic safety review rejected opening the instance in a browser. No real execution success is claimed. Follow [Phase 3's exact setup and approval step](PHASE-3.md).
