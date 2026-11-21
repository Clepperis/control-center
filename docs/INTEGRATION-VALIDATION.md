# Integration validation — 2026-11-17

Candidate: `codex/integration-readiness`, based on development target `11b1475`.
The [current status](CURRENT-STATUS.md) identifies the combined sources and the
remaining external dependencies. This is a self-review, not an independent review.

## Local verification

Windows, Node 24.16.0, installed Chrome and the committed npm lockfile.
Dependencies installed with `npm ci --ignore-scripts`; no dependency upgrades.

| Check                           | Evidence                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Lint                            | Passed                                                                                              |
| TypeScript                      | Passed, including the final production build                                                        |
| Unit/adapter/database tests     | 267 passed across 27 files                                                                          |
| Production build                | Passed with the integrated routes                                                                   |
| Runtime/operator bundles        | `build:runtime` passed                                                                              |
| Production access boundary      | Development bypass denied in production/test; OIDC anonymous access denied; new API routes included |
| Password HTTPS browser test     | Login/logout, reset revocation, CSRF, secure cookies and credential exclusions passed               |
| Integrated Tool Hub and lessons | Actual production HTTP, PostgreSQL-protocol fixture and browser flow passed                         |
| Operational UI                  | Synthetic chat, Paperclip, n8n, knowledge and Platform Engineer lifecycle/recovery passed           |
| Chat composer                   | Keyboard, failed-request recovery, accessibility and responsive behavior passed                     |
| Demo UI                         | Navigation at 1440/390px, dialogs, draft/review persistence, filtering and reset passed             |
| Local backup cryptography       | rclone 1.76.0 encryption/decryption checks passed; no database restore or off-host upload           |
| Formatting and diff integrity   | Prettier and `git diff --check` passed                                                              |

The production integration scenario verifies:

- A correct Tool Hub bearer can list/call tools. Missing/wrong bearers fail,
  an owner cookie cannot replace the bearer, and a bearer cannot approve lessons
  through the owner API.
- Actual UTF-8 body limits, including a forged short Content-Length and the exact
  32,000-byte boundary. The SDK enforces the bound before parsing tool input.
- A proposed lesson is excluded from approved lessons, appears in the owner UI,
  becomes visible to tools after approval, and disappears after retirement.
- An assistant answer with null usage metadata still offers feedback. A negative
  note creates a pending lesson; owner rejection survives an agent repeat.
- A repeated rejected lesson reports `rejected`, not a fresh approval request.
- Migrations 008/009 exist, Tool Hub calls reach the audit table, and populated
  shared usage renders beside application statistics.
- Lessons/statistics at 1440/390px pass automated AA scans and reflow checks.
  Captures were visually inspected; automated checks are not a full screen-reader audit.

Retained synthetic captures include
`.local/phase-6/integration-{lessons,statistics}-{1440,390}.png` and
`.local/screenshots/`. CI uploads only explicitly selected synthetic artifacts.

## Regressions found and corrected

The full demo accessibility suite also passed all ten routes at
1440/1024/390px, including skip-link keyboard use, dialog focus management,
mobile navigation and reduced-motion behavior.

The first operational UI run stopped on the old Paperclip results disclosure
selector. The new interface exposes comments directly; the test now asserts the
comments and explicit unavailable-approval notice without removing those checks.

The legacy-answer feedback scenario failed because feedback was nested inside
the optional usage summary. Feedback now depends only on the assistant role.
The scenario uses a real persisted answer without a paid model call. The MCP
client test also covers a rejected lesson's status remaining rejected.

The integration test initially expected JSON for all MCP revisions. The installed
SDK documents SSE for legacy traffic and JSON/SSE for modern traffic; the test
handles both. The unnecessary forced modern JSON option was removed.

## Evidence boundaries

The full suite uses PGlite and deterministic provider substitutes. The password
browser test runs the actual built application behind loopback synthetic TLS
and a PostgreSQL-protocol fixture; it does not prove Oracle execution.
No paid completion, real workflow execution, coding task, production migration,
agent resumption, merge into the development target or deployment occurred.

The local usage collector additionally completed a real read-only metadata sync,
with no instruction publishing. Public live-site health/login/anonymous-access
probes succeeded as recorded in current status. Neither proves this candidate
is deployed or that authenticated production readiness is current.

Native Linux ARM64 artifact execution, real PostgreSQL runtime-role checks and
database backup/restore run in `arm64-release` CI. Check the final source commit's
run and artifact hashes separately; Windows checks cannot prove them.

The dependency audit is not clean: the unpatched picomatch advisory and transitive
production dependency path are documented in current status. Recovery also
remains incomplete: local encryption tests do not establish off-host recovery
or a compatible production rollback.
