# Phase 6: single-owner authentication and controlled Oracle releases

Implementation and production authorization are separate. This document records
the implemented path and the remaining live gates. No Oracle/Hostinger settings,
DNS, certificates, Drive authorization or off-host data have been changed.

## Recovered state and placement

The implementation starts at Phase 5 `48dd6e6` on a new `codex/` branch, not main.
Remote inspection confirmed main still contains only the initial commit. Local
chat presentation changes are preserved and excluded from this phase's commit.
The preliminary owner choices and private local audit were read; private audit
contents, addresses and captures do not belong in Git.

Read-only Oracle inventory on 2026-11-10 observed Ubuntu 26.04.1 LTS, aarch64,
2 CPUs, 12 GiB RAM (about 10 GiB available), and about 30 GiB free on the root
persistent ext4 disk. Ollama, Whisper, Hermes and Tailscale workloads already run.
No Docker, Node, nginx, Caddy or rclone was found on the inspected PATH or the
checked common installation paths. Tailscale Serve is tailnet-only on an existing
port; it is not the proposed public HTTPS entry point. Existing workloads were
not stopped, installed over, reconfigured or bounded.

The OS IPv4 filter rejects new public inbound connections except SSH and its
existing Tailscale rules; IPv6 differs and must be reviewed explicitly. OCI
security lists/NSGs, the public IP and internet reachability remain unverified.
No OCI management credentials were discovered or created. Historical audit
observations are not proof of current cloud rules.

| Location                                                             | Data/processes                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Oracle `/opt/control-center/releases/<sha>`                          | Immutable native web, worker and operator artifacts, bundled Node, dependency lock and migration SQL                            |
| Oracle dedicated PostgreSQL 18 cluster, proposed loopback port 5433  | Conversations, jobs/leases, approvals, integration projections, owner credentials/sessions, knowledge indexes/revision metadata |
| Oracle `/var/lib/control-center/knowledge`                           | Authoritative Markdown, immutable history and retained conflicts                                                                |
| Oracle `/etc/control-center/releases/<sha>`                          | Separate protected web, worker and operator configuration; no secret values in Git                                              |
| Oracle `/var/lib/control-center/{runs,encrypted,retrieved,restores}` | Private backup preparation, ciphertext, receipts and disposable restore evidence                                                |
| Hostinger                                                            | Existing n8n/Paperclip and their internal databases; supported HTTPS application APIs only                                      |
| Google Drive, after separate approval                                | Ciphertext versions under `control-center-encrypted-backups/<uuid>`; no plaintext vault/dump upload                             |

Native systemd was selected because the inspected host already uses systemd and
has no container platform to reuse. There is no Docker requirement, second
scheduler, new agent platform, queue or general-purpose deployment API. Propose
nginx only if final preflight still finds no suitable existing public proxy.

## Authentication and identity

Better Auth 1.7.19 is pinned. Its published peers support Next 14/15/16, React
18/19 and pg 8. The installed Next 16.4.6 App Router documentation for route
handlers, headers, cookies, authentication and self-hosting was read. The
[official Next integration](https://better-auth.com/docs/integrations/next),
[PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql),
[session rules](https://better-auth.com/docs/concepts/session-management) and
[security guidance](https://better-auth.com/docs/reference/security) inform the
implementation. The app exposes a bounded facade over the supported handler;
it does not implement its own session token or cookie-signing protocol.

`AUTH_MODE=password` requires the exact HTTPS `APP_ORIGIN`, a random
`AUTH_SECRET` of at least 32 characters, PostgreSQL and a stable `OWNER_SUBJECT`.
Only development/test code can use loopback HTTP; production-built code cannot
be downgraded by setting runtime NODE_ENV=test. Explicit legacy OIDC remains
supported through its existing verification path, with no fallback between modes.

Passwords use maintained `@node-rs/argon2` 2.2.2: Argon2id v19, 64 MiB, 3 passes,
parallelism 1, random 16-byte library-generated salt, 32-byte output. This exceeds
the [OWASP minimum](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
The package publishes Linux ARM64 glibc/musl bindings. Local Windows verification
is not Oracle runtime validation; the native CI job tests the actual binding on
ARM64, and an approved Oracle run must still establish target behavior. There is
one hashing path and no automatic weaker fallback. Passphrases are 10–1024
characters; paste, Unicode and password-manager autocomplete are supported.

The PostgreSQL singleton constraint permits exactly one configured account after
operator bootstrap. Zero accounts before bootstrap grants nobody access. Public
sign-up, bootstrap, email recovery, user mutation and password-change routes are
not exposed. User-create hooks also deny account creation. There is no email
delivery service, social provider or first-visitor administrator behavior.

The only public auth operations are JSON POST sign-in and sign-out. Both require
the exact Origin and reject cross-site fetch metadata, bounded bodies and unknown
fields. Better Auth's own CSRF protections remain enabled. Redirect destinations
are a fixed allowlist of application paths. Library token/user JSON is not sent
to the client; only the supported signed session cookie is forwarded.

Cookies are HttpOnly, Secure and SameSite=Strict in production. Sessions expire
after 12 hours, do not refresh, and are checked against PostgreSQL on every owner
guard. Cookie session-data caching is disabled. Logout deletes the current session;
operator reset revokes all sessions. Login/reset share a database advisory lock
through password verification and session creation, preventing a concurrent
pre-reset password check from issuing a late session.

The global single-owner login budget allows 10 validly-shaped attempts per
15-minute database window. Its atomic row survives web/library/database restart;
submitted email and proxy/IP/identity headers cannot change its key. Concurrent
login attempts receive 429 instead of accumulating expensive hash work. Successful
attempts also consume budget. An attacker can temporarily exhaust this shared
budget; operator reset clears it. No unbounded per-email/IP rows are created.

`requireOwner` remains the authorization boundary for every server data page and
API operation; layout protection is additional. Missing storage/auth fails closed.
Identity-only headers are ignored. Login never grants action-specific coding,
automation, integration, model spending, merge or deployment consent.

### Operator bootstrap and recovery

After separately approved schema/configuration setup, use an operator terminal:

```sh
cd /opt/control-center/releases/EXACT_SHA
bin/node --env-file=/etc/control-center/releases/EXACT_SHA/operator.env dist/owner-password.mjs bootstrap
# Lost password or desired password change; revokes every session atomically:
bin/node --env-file=/etc/control-center/releases/EXACT_SHA/operator.env dist/owner-password.mjs reset
```

The command requires a TTY, asks for login email and hidden passphrase twice,
accepts no password arguments and logs no credential values. `OPERATOR_DATABASE_URL`
is separate from runtime access. Do not paste passwords, keys or tokens into chat.
Bootstrap refuses an existing owner. Reset requires exact configured subject/email.

Choose the persistent subject explicitly before bootstrap. `development-owner`
is forbidden. Existing subjects and approval records are never updated by 006 or
the bootstrap/reset procedure. Reusing an existing production subject preserves
that subject's records only when deliberately reviewed. Any data transfer from
development or a different owner requires a separate migration and approval.

The owner visits `/login`, enters the configured email and password, and uses
**Atsijungti** in the workspace footer. Login errors are generic. The Lithuanian
settings page describes password sessions; the established design is preserved.

## Build, artifact identity and CI

The existing validation workflow remains and adds password browser/boundary checks.
A separate free public `ubuntu-24.04-arm` job builds on native ARM64, not emulation
or cross-compilation. Actions are pinned to verified official commits. Node
24.22.2 is pinned. The PostgreSQL 18.6 fixture image and rclone 1.76.0 binary are
pinned by digest/checksum. This public CI has no production secrets and no deploy
permissions. See [GitHub runner availability](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

```sh
npm ci --ignore-scripts
npm run build
npm run build:runtime
npm run build:release
```

The release command requires Linux ARM64 and a clean checkout. It cannot package
the dirty Windows development tree. It copies only standalone web output, static
assets, compiled existing worker/operator commands, migration SQL, reviewed ops
files, locked production dependencies and the native Node binary. It installs
Linux dependencies afresh; Windows node_modules is never copied. Runtime deps are
locked and lifecycle scripts disabled. The artifact is identified by source SHA,
tar SHA-256, release-manifest SHA-256 and individual file hashes.

`.env*`, private audits, `.git`, `.local`, `.data`, vaults, logs, databases,
backups and screenshots are excluded and checked. Production boundary tests scan
Next traces/standalone output, and password browser tests scan client bundles/logs
for synthetic credentials. These checks complement positive-list packaging;
pattern scanning alone is not a general secret detector.

CI tests the staged native artifact's web/auth, actual worker restart/heartbeat,
persistent synthetic data, and real PostgreSQL dump/encrypted restore. Artifacts
are retained for seven days; copy a selected verified artifact into operator-owned
storage before expiry. Byte identity is immutable per artifact; independent
rebuilds are not claimed bit-for-bit reproducible (Next build IDs/metadata vary).
Building/running on GitHub ARM64 still does not prove Oracle execution.

## Provisioning, HTTPS and networking gates

Read-only DNS found no A record for a randomized candidate retained privately in
`.local/phase-6/hostname-check.json`. DNS absence is not provider availability or
a reservation. [DuckDNS](https://www.duckdns.org/spec.jsp) requires its own account
and token to manage a name. Account access, provider reservation availability,
ownership, propagation and certificate issuance remain unverified. No domain or
paid service will be purchased.

Before provisioning, assemble `docs/PHASE-6-RELEASE-REVIEW.md` as a private concrete
package: exact commit/artifact, machine fingerprint, public IP/name, effective
cloud/OS rules, unit/config hashes, migrations, storage quotas, secrets delivery,
restore evidence and rollback. Obtain approval for that exact package. Templates
and a generated local acknowledgement are an operator procedure, not owner
approval by themselves and not server-enforced human authorization.

The proposed changes, subject to review, are: create a dedicated OS account and
protected directories; install the dedicated supported PostgreSQL cluster and
reviewed systemd units; deliver the verified artifact and protected configuration;
reserve/update the exact free DuckDNS name; configure nginx if no suitable proxy
exists; obtain a free ACME certificate using the HTTP-01 endpoint; allow TCP
80/443 in the exact OCI and OS rules for the selected IPv4/IPv6 arrangement.
Do not touch existing workload units, ports, Tailscale, n8n or Paperclip.

Only nginx's intended 443 entry point and 80 redirect/ACME endpoint are public.
Web binds loopback 3210; PostgreSQL binds loopback 5433; worker has no listener.
The nginx template discards identity/Authorization headers, applies body/time
limits, hides readiness externally and avoids private access logs. Do not enable
its TLS server block without real certificate files. Follow
[Let's Encrypt challenge requirements](https://letsencrypt.org/docs/challenge-types/).
Test certificate chain/name/expiry without bypassing validation, DNS propagation,
IPv4/IPv6 reachability and external denial of internal ports. A self-signed local
test certificate is never public TLS evidence. DNS/TLS failure blocks readiness.

Resource, journald and PostgreSQL templates are under `ops/`. There are explicit
CPU/memory/task/start limits and graceful SIGTERM handling. Disk admission limits
and the unverified hard-quota prerequisite are documented in `ops/config/limits.md`.
The selected host has no verified directory quotas; production approval must
resolve that limitation and existing workload contention without silently changing
those workloads. No recurring backup, repair, deployment or merge is enabled.

## Migrations, startup, health and release updates

Review 006's five auth tables and heartbeat table before applying it. It is
additive, does not transfer owners and leaves all historical approvals unchanged.
Capture a coordinated pre-change backup and restore proof if any useful data
already exists. For an initial empty database explicitly record that fact. Do not
substitute an empty backup for an existing installation's recovery prerequisite.

```sh
# Separate explicit operation, with approved migration credentials:
bin/node --env-file=/etc/control-center/releases/EXACT_SHA/operator.env dist/migrate.mjs
# Read-only checksum compatibility preflight, using runtime access:
bin/node --env-file=/etc/control-center/releases/EXACT_SHA/web.env dist/migrate.mjs --check
```

No web/worker startup migration occurs. Apply reviewed runtime/worker grants after
SQL; these deny account/password/schema writes to runtime and all auth access to
worker. PostgreSQL cluster/admin credentials stay outside both. Operational
tables still have broad application CRUD; complete per-operation SQL privilege
separation is not claimed. Web necessarily reads password hashes for login.

Release units use `/etc/control-center/releases/<sha>/{web,worker}.env` and
`/opt/control-center/releases/<sha>`. They are stopped/started together by the
bounded `ops/deploy.mjs activate review.json approval.json` procedure. Runtime
configuration must be root-owned 0600; old reviewed versions are retained.
Provisioning, DNS, proxy/firewall changes and migrations remain separate reviewed
operator steps; activation does not install software or run arbitrary shell.

`/api/health` means only that the web HTTP process responds. `/api/ready` additionally
requires owner authentication, exact migration checksums, readable/writable
knowledge/history/conflict directories, >=1 GiB free and a recent successful
worker heartbeat for the same release. It makes no external integration calls.
`dist/readiness.mjs` adds a loopback web-health probe for the operator. Heartbeat
follows a successful full tick; >150 seconds without completion is degraded.
Disabled/unconfigured integrations do not make database/knowledge readiness fail.

Activation rechecks exact package approval/expiry (maximum 24 hours), artifact and
manifest/files, target `/etc/machine-id` hash, web/worker/network configuration,
schema, disabled execution switches and optional reviewed previous release.
It observes loopback readiness and public HTTPS health after starting. A durable
exclusive deployment lock is deliberately retained for reconciliation before any
retry. Inspect actual units/health/result and remove the lock only after resolving
the result. There is no autonomous retry after a partial or uncertain operation.

## Backup, encryption, retention and restore

[rclone Drive scopes](https://rclone.org/drive/#scopes) support `drive.file`, limited
to files created/authorized for that OAuth application. A root folder alone is
not token confinement. Use a dedicated OAuth desktop client and `drive.file`,
not the broad default `drive` scope. Current rclone docs warn its shared client is
being retired during 2026; creating a client, changing consent settings and initial
Drive authorization require separate approval. Existing account type, reported
20 TB capacity, token scope and usable free quota remain unverified. The connected
Drive tools do not expose the quota needed to establish backup readiness.

Use operator-controlled `rclone config` in a terminal and a protected config file.
Create `cc-local` as type `crypt`, remote `/var/lib/control-center/encrypted`,
standard filename encryption and directory encryption enabled. Create `cc-drive`
as Drive with `drive.file` and the separately approved client/token. Encrypting
and restoring local tests does not require any Drive authorization. Rclone config
contains reversible obscured crypt secrets/OAuth refresh material; protect it as
a secret (optionally use rclone's config encryption and approved pass delivery).
Store the crypt password AND salt/recovery configuration off Oracle in an
approved password manager/offline recovery location. Test recovery using that
independent copy. Never print, commit or pass these values as deployment arguments.

`ops/backup.mjs` provides snapshot, encrypt, separately approved upload, retrieve
and disposable restore. A private options JSON supplies fixed root
`/var/lib/control-center`, knowledge path, reviewed release/schema, rclone config
path and the explicit external-writers-stopped declaration. Prepare managed
`runs`, `encrypted`, `retrieved`, `restores` directories before invoking it.

1. Explicitly stop web/worker and all external Markdown editors for the bounded
   backup window. Snapshot verifies unit inactivity before/after; it hashes the
   knowledge tree before dumping and verifies both source and copy afterward.
2. `snapshot options.json` runs a custom-format consistent `pg_dump` using protected
   libpq service `cc-backup`, captures Markdown/history/conflicts and release/schema
   metadata, and produces a checksum manifest. It never copies live PGDATA files.
3. `encrypt options.json UUID` writes locally encrypted files, then uses
   [cryptcheck](https://rclone.org/crypt/#modification-times-and-hashes). Failure
   evidence is retained; duplicate version IDs refuse overwrite. Restart services
   only after the coordinated snapshot is complete and verified.
4. Review the exact ciphertext receipt SHA, UUID, destination, bytes, storage scope
   and one-shot effects. `upload options.json UUID approval.json` requires an owner
   acknowledgement bound to that receipt. It checks free Drive quota and refuses
   more than 30 versions or 20 GiB. It copies ciphertext with `--immutable`, then
   checks remote ciphertext. It never mirrors, deletes or schedules. An exclusive
   upload-attempt marker prevents blind replay after uncertainty.
5. `retrieve options.json UUID` downloads ciphertext into an exclusive new directory
   and checks the retained receipt. Set `restoreSource` to `retrieved` to prove
   off-host recovery. Keep ciphertext receipts and artifact identities off Oracle
   as part of the separate operator recovery kit. Loss of both the server and
   this recovery kit is an unresolved disaster-recovery risk.
6. `restore options.json UUID` verifies ciphertext, decrypts into a fresh managed
   directory, verifies the plaintext manifest and restores with `pg_restore` into
   a random new `cc_restore_*` database on an explicitly checked loopback server.
   `RESTORE_DATABASE_URL` is a separate protected loopback test credential for
   application checks; production databases are never replaced. `dist/restore-check`
   verifies exact schema, one owner, owner-scoped application reads and every
   registered document/history hash against parsed Markdown. Evidence and the
   disposable DB remain for review on success/failure; no automatic cleanup.

The protected `PGSERVICEFILE` contains `cc-backup` and `cc-restore` configurations;
`PGPASSFILE` provides their separate credentials. The backup service is the
dedicated application database only. No database URLs/passwords go in child
command arguments. Backup tooling rejects ambiguous PG/RCLONE overrides, symlinks,
special/hard-linked files, unmanaged paths and over-limit inventories. Output is
bounded/sanitized; child tool output is suppressed because it can reveal secrets
or filenames. Inspect private diagnostics locally if a generic step fails.

Proposed retention is up to 30 versioned backups / 20 GiB, initially manual.
Versions older than 30 days are candidates for an exact reviewed deletion, not
automatic deletion. Reaching a limit fails closed; preserve at least the last
verified restore and pre-migration backup. There is no recurring schedule or
automatic pruning. Initial authorization, exact test upload and any later
retention deletion/schedule need separate concrete approval.

## Rollback and failure recovery

An older image alone is insufficient. Activation requires an optional previous
artifact and configuration hashes plus reviewed schema compatibility and a
verified password boundary. If new health fails, both new processes stop, both
compatible previous processes start and readiness/HTTPS are checked again.
If rollback fails or stopping is uncertain, retain evidence, stop where safely
possible and reconcile actual units before retrying. No data restoration occurs
automatically. A first installation has no previous running version; failed
activation leaves it stopped and retains all persistent data.

006 is SQL-additive to Phase 5, but Phase 5 cannot serve password login. Do not
publicly roll back to it as an authentication workaround. Prefer a tested
password-capable earlier Phase 6 artifact on unchanged schema. If schema or
Markdown compatibility requires restoring data, review the exact pre-change DB
AND Markdown snapshot, configuration/artifact pairing and every write that would
be lost, obtain separate approval, and restore in isolation first. Never silently
overwrite new owner conversations, approvals, memory or history.

| Failure                                                         | Required behavior                                                                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Missing auth/DB/config; expired/revoked session                 | Generic denial; no demo/development/proxy-header fallback                                                             |
| Login flood                                                     | Durable shared 429 window; operator recovery if needed                                                                |
| Worker interruption                                             | Existing leases/reconciliation retained; no blind external resubmission; stale heartbeat fails readiness              |
| Bad/pending/newer migration                                     | Checksum preflight refuses startup promotion; inspect explicit transaction result                                     |
| n8n/Paperclip/gateway unavailable                               | Existing unavailable/disabled states; leave execution off; do not fabricate capability                                |
| DNS/TLS/OCI/OS firewall uncertainty                             | No public readiness claim; inspect both network layers and address families                                           |
| Disk/memory pressure                                            | Admission/readiness failure and cgroup limits; preserve data; resolve quotas/resource contention before live approval |
| Partial deployment/failed rollback                              | Retain lock/results/releases; inspect actual units before another attempt                                             |
| Failed upload/decryption/restore                                | Retain stages/ciphertext/attempt receipts and disposable DB; reconcile before retry; no deletion propagation          |
| Changed artifact/config/target/effects or stale acknowledgement | Reject; refresh owner review and approval                                                                             |

## Consent and remaining live gates

Initial runtime config sets model calls, delegation, n8n execution and coding
executor false and provides no integration credentials. Do not copy Codex session
credentials. Authorized read-only application probes come first, with separate
credentials for gateway, n8n, Paperclip operator, repository/coding runtime,
deployment and backup. Coding tasks receive no production DB/auth/backup/deploy
credentials or Docker socket. Endpoint configuration, authenticated probe,
installed API contract, execution capability and real completed execution remain
distinct evidence states. All earlier action-specific approvals remain intact.

The pending real isolated Phase 5 coding example is not a prerequisite for this
independent implementation; it still blocks claiming the full improve → integrate
→ deploy lifecycle. No paid model/coding test, merge, deployment or autonomous
repair is included here.

Validation evidence belongs in `docs/PHASE-6-VALIDATION.md` and ignored local/CI
artifacts. The review pass is self-review; no independent reviewer or owner
approval is claimed. Before calling this fully live verified, obtain exact owner
authorization and establish Oracle artifact execution, real public TLS/login,
persistence and worker recovery on the host, off-host encrypted upload/retrieval
and isolated restore, plus tested compatible rollback or an explicit remaining gate.
