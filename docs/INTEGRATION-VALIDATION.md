# Integration validation — 2026-11-17

The dated integration evidence below is retained. A separate local-only release
review was repeated on 2026-11-18; see the appended record and the exact
[release-candidate package](RELEASE-CANDIDATE.md).

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

## 2026-11-18 local release-package revalidation

Validated source `6818cefc63d167687a0227fa592d4879033b38d7`, the exact starting
`origin/codex/integration-readiness` revision for `codex/release-candidate-package`.
Checks ran in an isolated detached source copy with no `.env.local`, cleared
inherited application/PG credentials, external execution disabled and telemetry
off. Node 24.16.0 / npm 11.13.0 / Windows x64; dependencies installed with the
requested **`npm ci`**, without changing the lockfile or suppressing the audit.

| Exact command                                              | Exit | Result                                                                                                 |
| ---------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------ |
| `npm ci`                                                   | 0    | Clean locked install; audit findings retained                                                          |
| `npm run lint`                                             | 0    | Passed                                                                                                 |
| `npm run typecheck`                                        | 0    | Passed                                                                                                 |
| `npm test`                                                 | 0    | 267 tests in 27 files                                                                                  |
| `npm run build`                                            | 0    | Production Windows build                                                                               |
| `npm run build:runtime`                                    | 0    | Worker/operator bundles                                                                                |
| `npm run test:boundary`                                    | 0    | Production access guards                                                                               |
| `npm run test:backup`                                      | 0    | Local cryptography/negative controls; default mode has no database restore                             |
| `npm run test:password:ui`                                 | 0    | Actual built app with synthetic loopback TLS/PG protocol; MCP/lessons/feedback/usage and access checks |
| `npm run test:ui:live`                                     | 0    | Synthetic orchestration/n8n/knowledge/Platform Engineer workflows                                      |
| `npm run test:chat:ui`                                     | 0    | Composer/recovery/accessibility                                                                        |
| `npm run test:ui`                                          | 0    | Demo navigation, persistence, dialogs and reset                                                        |
| Initial `npm run test:a11y` without `UI_BASE_URL`          | 1    | Wrong local default origin; `Cannot GET /chat`                                                         |
| `npm run test:a11y` with `UI_BASE_URL=<LOCAL_DEMO_ORIGIN>` | 0    | Same suite against isolated app: ten routes, three widths, AA/keyboard/reflow                          |
| `npm run build:release`                                    | 1    | Correctly refused: `native_linux_arm64_required`                                                       |
| `node scripts/verify-native-artifact.mjs`                  | 1    | Native-platform assertion before artifact access                                                       |

The native commands were attempted, not skipped or weakened. They do **not**
establish ARM64 verification on this machine. The previously cached 176,859,930-byte
artifact still embeds the tested source SHA; its tar and manifest hashes and all
nine SQL checksums were rechecked locally. It was not rebuilt, extracted or
executed. Historical 2026-11-17 CI receipts do not become fresh native/Oracle proof.

Separate real PostgreSQL 18.6 Windows rehearsal: initialize a new loopback cluster;
apply 001–009 to an empty DB; rerun unchanged; take a pre-change custom dump and
Markdown/history backup of a populated 001–006 fixture; apply 007–009 preserving
data; reapply shipped grants and test auth/schema denials. A transaction-level
lock observation found `ShareRowExclusiveLock` on existing `messages` during 009.
The old six-migration schema check refused the upgraded database as expected.

The same local rehearsal used real `pg_dump`, rclone encryption/decryption,
ciphertext integrity checks, real `pg_restore` into another scratch DB and
`node --import tsx scripts/restore-check.ts` (exit 0). Result: one owner, one
document and two historical revisions restored and verified. Off-host storage
and retrieval used local directories; no-writer/systemd observation was a
deterministic substitute. No Google Drive, Oracle, live model, DNS, certificate,
Paperclip, budget, branch-protection or production-secret operation was performed.

Command/timestamp/exit logs, schema catalogs, receipts and scratch data are
retained privately. No product code changed. Local orchestration mistakes
(fixture import depth, wrapper path after changing directory, and a lost explicit
demo origin) were corrected before complete reruns. The initial a11y failure is
recorded, and all assertions were retained. Successful check results above come
from the actual reruns. Unsupported-platform failures remain
explicit. Required target approvals and the live-model-policy/rollback blockers
are listed in the release-candidate package.
