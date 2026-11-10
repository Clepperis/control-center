# Phase 6 evidence and remaining gates

Sanitized implementation evidence; detailed local diagnostics/captures stay ignored.
This is not an Oracle deployment certificate or owner approval.

## Local checks (Windows x64, Node 24.16.0)

- Read-only local/remote Git inventory confirmed Phase 5 `48dd6e6` as the base;
  main is not the completed application. Existing chat edits are preserved.
- Read-only Oracle SSH observed aarch64 Ubuntu 26.04.1, 2 CPUs, 12 GiB RAM and
  about 30 GiB free persistent disk, existing services/listeners and OS filtering.
  No server processes/containers/services were created or configuration changed.
- Official current Better Auth/pg/Next compatibility, Argon2 binding targets,
  DuckDNS requirements, ACME challenge rules, rclone Drive/crypt scopes and ARM64
  distribution, PostgreSQL 18 and free native GitHub runners were checked.
- `npm test`: 114 tests passed across 13 suites. Includes functional Better Auth
  handler with PostgreSQL wire/PGlite, salted Argon2id, operator bootstrap,
  singleton/owner isolation, login/logout, fixed expiry, reset revocation, CSRF,
  unsafe redirects, spoofed headers, durable throttle/reopen and failures.
  PGlite's multiplexed connections are not proof of real PostgreSQL lock contention;
  native PostgreSQL fixture execution is a separate CI gate.
- Deployment tests cover exact package/target/stale approval, actual file hashes,
  changed payloads, managed paths/links, exact migration compatibility and bounded
  failure/rollback transitions. Injected systemctl results are deterministic
  procedure tests, not a real Oracle rollback drill.
- `npm run typecheck`, `npm run lint`, `npm run build:runtime` and the production
  Next build pass. A dynamic runtime-storage trace warning was fixed rather than
  excluding an entire project from security checks.
- `npm run test:boundary` passes against the production artifact, including
  runtime NODE_ENV=test development-bypass attempts, protected reads/mutations
  and private standalone/trace exclusions. Legacy OIDC checks remain in place.
- `npm run test:password:ui` passes with a real built production process and a
  synthetic self-signed loopback HTTPS proxy. Actual login/logout, protected
  pages/API, project creation/selection, Origin rejection, reset invalidation,
  Secure/HttpOnly/Strict cookies and client-bundle/log exclusions were observed.
  Desktop 1440px and mobile 390px login captures/AA scans pass. Synthetic TLS is
  not evidence of a valid public certificate. Test-proxy/locator bugs were fixed.
- `npm run test:ui:live` passes earlier chat/Paperclip, n8n discovery/review/exact
  approval/reconciliation, knowledge/history/citations and Improve System flows.
  Deterministic external transports remain explicitly synthetic; no real coding,
  paid model call, workflow execution or merge occurred.
- `npm run test:ui` and `npm run test:a11y` pass against an isolated loopback
  demo process: eight routes at 1440/1024/390px, navigation/dialog/draft/review
  persistence, filters, keyboard/focus, mobile drawer, reduced motion and AA scans.
  The demo process was stopped after checks; the owner's normal dev server was
  not used. `npm run format:check` and whitespace validation pass.
- Official rclone 1.76.0 Windows binary was checksum verified. `npm run test:backup`
  passes actual local crypt encryption/decryption, manifest/ciphertext integrity,
  tampering/path/duplicate-version rejection and missing-upload-approval denial.
  This local run does not contain a PostgreSQL dump or a Drive upload. It does
  not substitute for the native real pg_dump/pg_restore CI test.
  Wrong-key decryption and broad Drive-scope rejection are also tested; strict
  encrypted filename decoding prevents rclone silently skipping unreadable names.
- Production dependency audit reports zero known vulnerabilities.

Login and owner screenshots were visually inspected. Login fields use the existing
`.input` design-system control after review. Captures contain synthetic data only
and remain under `.local/phase-6`; no captures enter the release payload.

## Native CI evidence

The workflow's `arm64-release` job requires actual Linux ARM64, builds the exact
clean source, verifies every payload file and emits `artifact.json` with tar and
manifest hashes. It runs native password/worker/persistence/readiness checks
against PostgreSQL 18.6 and restores a real custom-format dump plus Markdown/history
after rclone encryption/decryption into a separate disposable database. The
systemd quiescence observation is substituted only for the static synthetic backup
fixture; dump, crypt and restore tools are real. No Google upload occurs.

Native fixture checks also apply the shipped runtime/worker SQL grants, prove
account/password/schema-write denial, run each process with its respective role
and check PostgreSQL's real reset/login advisory lock. The first native packaging
run correctly rejected an escaping link caused by Node's default copy behavior;
release copies now preserve relative links and still reject escaping targets.
The PostgreSQL test fixture binds an isolated native container to loopback using
host networking; bridge NAT does not weaken the production restore guard's
requirement that the observed database endpoint is local.

The final pushed commit's CI outcome and downloadable artifact identity must be
checked separately. Do not infer a successful native run merely from this workflow
definition. CI artifacts include sanitized native/backup result JSON alongside
the immutable tar, never configuration or test databases.

## Self-review

No independent reviewer was used. A separate self-review pass checked public-file
boundaries, stable owner identity, runtime SQL privileges, reset/login serialization,
library cookie semantics, worker shutdown, stale release approvals, failure
reconciliation and backup paths. It caught/fixed the library's special 24-hour
non-remembered-session behavior (the configured fixed 12-hour path is now tested),
runtime storage tracing, missing visible input styling, missing credential-row
reset detection, command-timeout success handling, target/config binding, worker
secret separation and upload scope/retention admission checks.

## Unverified production gates

No production application was deployed. Oracle existing workloads were untouched.
Hostinger, DuckDNS, OCI rules, proxy/certificates and Google Drive are unchanged.
Randomized DNS absence is only a candidate check, not name availability/reservation.
No backup credentials or account authorization were created or reused from Codex.

Remaining: exact provider reservation/account setup, OCI/public-IP/IPv6 reachability,
real trusted HTTPS, hard disk quotas and workload coexistence, protected runtime
secrets and real owner bootstrap, exact artifact execution/persistence/worker
recovery on Oracle, encrypted Drive upload/retrieval/decryption/isolated restore,
independent recovery-secret test and a real compatible rollback drill. Phase 5's
separate real isolated coding example is still outstanding. These gates prevent
claiming Phase 6 fully live verified.
