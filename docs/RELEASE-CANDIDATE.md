# Phase 6 release candidate

Updated 2026-11-21 for draft PR #20 into `codex/phase-6-owner-auth-deployment`.
The owner approvals below are prepared for review. Fill deployment-specific values
in protected operator storage. Use placeholders in GitHub and enter credentials
only in the owner's terminal or secret store.

## Exact release and CI evidence

| Item                            | Value                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Source branch                   | `codex/phase-6-owner-auth-deployment`                                        |
| Source commit                   | `29eaa9e7ac5614f4555f740f6a946772549fcdc4`                                   |
| Target platform                 | Linux ARM64, Node 24.22.2                                                    |
| Tar filename                    | `control-center-29eaa9e7ac5614f4555f740f6a946772549fcdc4-linux-arm64.tar.gz` |
| Tar size                        | 176,857,799 bytes                                                            |
| Tar SHA-256                     | `940f4354e52f105ffec65ab02ca07b379175c5e61d3d2cc573923e64906e6774`           |
| Embedded `release.json` SHA-256 | `98a1ebe77e9c0df73f694677d67dfcda4786c51e18923b4eaf22408f8027891b`           |

The exact target-branch commit includes [PR #21](https://github.com/Clepperis/control-center/pull/21).
GitHub Actions built and ran that payload on native Linux ARM64. The checks covered
password login, persistence, worker restart, PostgreSQL runtime-role boundaries,
and real PostgreSQL dump and isolated restore with local rclone encryption.
The downloaded tar and embedded manifest hashes matched the CI receipt. All nine
SQL files and the shipped deploy, backup and roles files matched the manifest
and source bytes. The artifact binds the source commit above. Re-review any new
payload, SQL or ops changes. The Actions download expires on 2026-11-28 at
12:08 UTC. Keep a verified private copy before then, or review and record the
hashes of a fresh CI build before approving it.
[CI run](https://github.com/Clepperis/control-center/actions/runs/44902204714) ·
[ARM64 job](https://github.com/Clepperis/control-center/actions/runs/44902204714/job/136840256420) ·
[Artifact download](https://github.com/Clepperis/control-center/actions/runs/44902204714/artifacts/14706646361)

PR #21 requires a boolean `review.liveModelEnabled`. With `true`, the validator
requires `LIVE_MODEL_ENABLED=true` in both reviewed env files, including both
files for any previous release named in the review. The same exact-match rule
requires `false` if the reviewed decision is false. Delegation, n8n execution
and the coding executor still require the literal string `false`. Preserve the
existing Nexos key, model, token and timeout bounds in the web configuration.
Leave `TOOL_HUB_TOKEN` unset and keep auth credentials out of the worker.
[Activation fix](https://github.com/Clepperis/control-center/pull/21)

## Ordered migration manifest

The last documented deployed baseline, `d69a8c1345c1ef3cccd21341ea964a5bf2a1ce8c`,
contains 001–006. If the owner's ledger matches that baseline, 007–009 are pending.
The actual pending set is approved only after the owner captures the private
ledger and compares every name and checksum to this manifest.

| Filename                  | SHA-256                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `001_foundation.sql`      | `c00b67edfdb0a70e8c79f190b5d6f455906e433c5f4ae3126b25825f3e351ba0` |
| `002_orchestration.sql`   | `0a830ffef3ef34b7738d747c8d944da1284ce04e817bcfe3e10de82cf58af7cb` |
| `003_automations.sql`     | `963ed73006f741998e12e81481d9c087ba132ae2a4d90024de56c37d38d479dc` |
| `004_knowledge.sql`       | `77304113926cd0269a366eee7925edd2be34057d7eeb791d741a0e472a37085d` |
| `005_improvements.sql`    | `11a1ec1e7e8d78ad49b2feebd42814b7fc03dfd59f17de8752aa708c90baf78f` |
| `006_owner_auth.sql`      | `a25b5526e24cedf857f43f5becb91e3149eb442f60768b8989c6e5d5513b29b2` |
| **`007_model_usage.sql`** | `d530823bd784894d06f2fe0041231f04f1e44aa0bf438213d1608a43aa8aef42` |
| **`008_tool_calls.sql`**  | `3bd5a426733f47677bdc3fce76b0e7a70cbcd26555947e5ad48b6adf0eac0b02` |
| **`009_lessons.sql`**     | `b3d86693ebec7248e58650186e41e59db9e25ff59d56a382fc32dfde57c0d879` |

007 adds model usage. 008 adds Tool Hub audit metadata without tool arguments or
results. 009 adds lessons and message feedback, without rewriting or backfilling
existing data. In the earlier local PostgreSQL rehearsal, 009's foreign key
held a `ShareRowExclusiveLock` on existing `messages` until commit. Allow for
blocked writers and enforce a lock timeout.
[November 18 PostgreSQL rehearsal](INTEGRATION-VALIDATION.md#2026-11-18-local-release-package-revalidation)

## Exact remaining owner approvals

Approve each package separately and record the target, operator, exact inputs
and UTC start/end privately. Shell snippets are future operator steps. In them,
variables such as `RELEASE_DIR`, `ACTIVE_SHA` and paths to private JSON files
refer to values the operator sets in the protected terminal.

### A. Server SQL

**Owner by hand.** Sign in to `<ORACLE_HOST>` with your operator identity and
authorize the maintenance window. Supply the backup and migration credentials
in protected libpq files and `operator.env`. Approve the exact ledger diff,
GRANT roles and verified backup receipt. Reserve **30–60 minutes**, including
5–15 minutes for the snapshot and 5–20 minutes for isolated restore on a small
installation. If the active release has six migrations, reserve a contiguous
window with B and settle D before opening the migration window.

1. Read the live ledger using the private migration service. Compare
   the ordered output against the table and save it privately. The expected
   pending rows are the three bold entries. Stop for a missing prefix, a
   changed checksum, unexpected SQL, or any disagreement with the reviewed
   pending list. Verify the candidate tar and release manifest as in B.
   Repeat the ledger read after quiescence and before executing SQL.

   ```sh
   psql -X -v ON_ERROR_STOP=1 "service=$MIGRATION_SERVICE" \
     -c 'SELECT name, checksum, applied_at FROM public.schema_migrations ORDER BY name'
   ```

2. Freeze owner writes, uploads, Markdown edits and any external writers. Stop
   both live Control Center units and confirm each is inactive. Record
   `<LAST_RETAINED_WRITE_UTC>`, the active immutable release and its config hashes.
   Prepare protected backup options as in C using the **active** release's
   manifest identity and schema, and a `cc-backup` libpq service for the live
   application DB. Snapshot coordinated PostgreSQL and Markdown/history/conflicts
   with the verified `ops/backup.mjs`. Encrypt locally. Record the UUID, the
   ciphertext receipt and their hashes. Confirm both units are inactive before
   running the snapshot command. If either backup command fails,
   stop the sequence and reconcile before retrying.

   ```sh
   sudo systemctl stop "control-center-web@${ACTIVE_SHA}.service" \
     "control-center-worker@${ACTIVE_SHA}.service"
   sudo systemctl show -p ActiveState "control-center-web@${ACTIVE_SHA}.service" \
     "control-center-worker@${ACTIVE_SHA}.service"
   "$RELEASE_DIR/bin/node" "$RELEASE_DIR/ops/backup.mjs" snapshot "$BACKUP_OPTIONS"
   "$RELEASE_DIR/bin/node" "$RELEASE_DIR/ops/backup.mjs" encrypt "$BACKUP_OPTIONS" "$BACKUP_ID"
   ```

   On a dedicated recovery machine, securely transfer only the encrypted
   `encrypted/<BACKUP_UUID>` tree and `runs/<BACKUP_UUID>/encrypted-receipt.json`
   into the same relative directories in the managed root. Stage the matching
   active release as in C. Prepare private restore options with `restoreSource`
   set to `encrypted` and `rcloneConfig` pointing to the recovered crypt
   configuration. Set `cc-restore` and `RESTORE_DATABASE_URL` to the same
   dedicated disposable loopback instance. Run:

   ```sh
   "$RECOVERY_TOOL_DIR/bin/node" "$RECOVERY_TOOL_DIR/ops/backup.mjs" restore \
     "$LOCAL_RESTORE_OPTIONS" "$BACKUP_ID"
   ```

   Review `restore_verified` and match its UUID to the encrypted receipt. Keep
   the receipt and proof at the protected paths in the activation example.

3. Verify lock and statement timeouts for the migration connection, for example
   5 seconds and 120 seconds using `PGOPTIONS` and `SHOW`. Review the timeouts
   against the approved window. Run the bundled migrator from its release
   directory with `NODE_ENV=production` and `MIGRATION_DATABASE_URL` in the
   protected operator env. It applies the approved pending batch in one
   transaction under an advisory lock. Then apply the shipped grants in a
   separate transaction as the application DB owner.

   ```sh
   cd "$RELEASE_DIR"
   PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s' \
     bin/node --env-file="$OPERATOR_ENV" dist/migrate.mjs
   PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s' \
     psql -X --single-transaction -v ON_ERROR_STOP=1 \
       -v runtime_role="$WEB_ROLE" -v worker_role="$WORKER_ROLE" \
       -f ops/postgres/roles.sql "service=$DB_OWNER_SERVICE"
   ```

4. Check the final ordered ledger and run `dist/migrate.mjs --check` from
   `RELEASE_DIR` with each protected runtime env. Verify web and worker CRUD on
   the four new tables (`model_usage`, `tool_calls`, `lessons`,
   `message_feedback`) via privilege queries. Both runtime roles require
   schema `USAGE` and ledger `SELECT` only. Check schema `CREATE` and
   ledger writes are denied, web can read `auth_user`/`auth_account` and
   write `auth_session`/`auth_login_budget`, and worker has no auth
   privileges. Check role inheritance/ownership too. Keep migration identity
   out of runtime. Record grants and checks before B.

   ```sh
   cd "$RELEASE_DIR"
   bin/node --env-file="$WEB_ENV" dist/migrate.mjs --check
   bin/node --env-file="$WORKER_ENV" dist/migrate.mjs --check
   ```

**Failure and undo.** If the coordinated backup or restore proof fails, stop
before SQL. Lock/DDL failure aborts the migration transaction. Re-read the
ledger before restarting the unchanged release. If grants fail after SQL
commits, keep writers stopped, inspect the recorded state and reconcile the
reviewed grants before activation. The six-migration release rejects an
upgraded schema. Use D's separately approved recovery path if the upgrade has
to be undone after commit.

### B. Production activation

**Owner by hand.** Sign in to `<ORACLE_HOST>` and the existing owner account.
Provide exact root-only web and worker envs privately, preserving the owner
subject and auth/session secret. Review and record the exact values below,
then create the expiring acknowledgement only after approving the complete
review file. Reserve **25–40 minutes**, with **10 minutes of observation**
after readiness and any approved restart. Agree on A's coordinated outage and
D's rollback gate before taking the application offline.

1. Match the candidate source, tar size, tar hash and embedded manifest hash to
   the exact release table. Keep the verified tar at
   `/var/lib/control-center/incoming/<RELEASE_SHA>.tar.gz`. Inspect the archive
   for traversal and escaping links, stage into a new root-owned release
   directory following the [private worksheet](PHASE-6-RELEASE-REVIEW.md), and
   verify the staged payload against its manifest before using its bundled Node
   or operator tools.
2. Hash the actual bytes of `/etc/machine-id`, the candidate and previous
   protected env pairs and `/etc/control-center/network-plan.json` using
   `sha256sum`. Privately record `<TARGET_MACHINE_SHA256>`,
   `<WEB_ENV_SHA256>`, `<WORKER_ENV_SHA256>`, `<NETWORK_PLAN_SHA256>`
   and the previous manifest/env digests. Inspect the effective unit settings,
   available disk (at least 5 GiB for activation), existing HTTPS route and
   valid certificate, and bound loopback listeners against the reviewed plan.
   Resolve drift before signing. Review the A recovery proof and backup receipt
   and hash the exact protected JSON bytes. These private hashes have to be
   captured on the reviewed target before approval.

   ```sh
   sudo sha256sum /etc/machine-id /etc/control-center/network-plan.json \
     "$WEB_ENV" "$WORKER_ENV" "$PREVIOUS_WEB_ENV" "$PREVIOUS_WORKER_ENV" \
     /var/lib/control-center/recovery-proof.json \
     /var/lib/control-center/prechange-backup-receipt.json
   ```

3. Confirm A's exact nine-row schema and D's verified nine-schema-compatible
   rollback release with matching protected flags and a tested password
   boundary. Ensure the runbook accounts for the actual active/stopped units.
   Match the ordered `schema` array to the verified `release.json`, including
   all nine entries. The example proposes D's nine-migration CI candidate as
   `previous`. Use the example only after privately verifying the proposed
   rollback target and substituting the protected values.

   ```json
   {
     "version": 1,
     "commit": "29eaa9e7ac5614f4555f740f6a946772549fcdc4",
     "artifactSha256": "940f4354e52f105ffec65ab02ca07b379175c5e61d3d2cc573923e64906e6774",
     "manifestSha256": "98a1ebe77e9c0df73f694677d67dfcda4786c51e18923b4eaf22408f8027891b",
     "targetMachineSha256": "<TARGET_MACHINE_SHA256>",
     "hostname": "<APP_HOSTNAME>",
     "port": 3210,
     "dataRoot": "/var/lib/control-center",
     "executionEnabled": false,
     "liveModelEnabled": true,
     "migrationsAppliedSeparately": true,
     "schema": [
       {
         "name": "001_foundation.sql",
         "checksum": "c00b67edfdb0a70e8c79f190b5d6f455906e433c5f4ae3126b25825f3e351ba0"
       },
       {
         "name": "002_orchestration.sql",
         "checksum": "0a830ffef3ef34b7738d747c8d944da1284ce04e817bcfe3e10de82cf58af7cb"
       },
       {
         "name": "003_automations.sql",
         "checksum": "963ed73006f741998e12e81481d9c087ba132ae2a4d90024de56c37d38d479dc"
       },
       {
         "name": "004_knowledge.sql",
         "checksum": "77304113926cd0269a366eee7925edd2be34057d7eeb791d741a0e472a37085d"
       },
       {
         "name": "005_improvements.sql",
         "checksum": "11a1ec1e7e8d78ad49b2feebd42814b7fc03dfd59f17de8752aa708c90baf78f"
       },
       {
         "name": "006_owner_auth.sql",
         "checksum": "a25b5526e24cedf857f43f5becb91e3149eb442f60768b8989c6e5d5513b29b2"
       },
       {
         "name": "007_model_usage.sql",
         "checksum": "d530823bd784894d06f2fe0041231f04f1e44aa0bf438213d1608a43aa8aef42"
       },
       {
         "name": "008_tool_calls.sql",
         "checksum": "3bd5a426733f47677bdc3fce76b0e7a70cbcd26555947e5ad48b6adf0eac0b02"
       },
       {
         "name": "009_lessons.sql",
         "checksum": "b3d86693ebec7248e58650186e41e59db9e25ff59d56a382fc32dfde57c0d879"
       }
     ],
     "configSha256": {
       "web": "<WEB_ENV_SHA256>",
       "worker": "<WORKER_ENV_SHA256>"
     },
     "networkPlanSha256": "<NETWORK_PLAN_SHA256>",
     "recovery": {
       "emptyInitialDatabase": false,
       "proofSha256": "<RECOVERY_PROOF_SHA256>",
       "backupReceiptSha256": "<BACKUP_RECEIPT_SHA256>"
     },
     "previous": {
       "commit": "788a27783c7547ac34e8c4e684ce528ff35cba45",
       "manifestSha256": "958a5ad22aff0dbaeea85647b9ebedb926fa486d742394dc352cab75de4b754b",
       "configSha256": {
         "web": "<PREVIOUS_WEB_ENV_SHA256>",
         "worker": "<PREVIOUS_WORKER_ENV_SHA256>"
       },
       "supportsCurrentSchema": true,
       "passwordBoundaryVerified": true
     }
   }
   ```

   The `recovery` hashes refer to
   `/var/lib/control-center/recovery-proof.json` and
   `/var/lib/control-center/prechange-backup-receipt.json` respectively.
   Review the intended effects with the owner. Nexos chat remains available with
   its current bounds and can spend on owner-initiated requests.
   `LIVE_MODEL_ENABLED` is exactly `true`, and `LIVE_DELEGATION_ENABLED`,
   `N8N_EXECUTION_ENABLED` and `IMPROVEMENT_EXECUTOR_ENABLED` are exactly
   `false` in each reviewed web/worker config. Leave `TOOL_HUB_TOKEN` absent.
   The activation check does not attest Tool Hub configuration, so inspect it
   privately in both releases. Verify owner identity/storage continuity and
   that the plan uses the existing network/TLS setup. A paid Nexos smoke test
   would require separate approval.

4. Hash the completed review file. The owner creates root-only `approval.json`
   with `approvedBy: "owner"`, `action: "activate"`, `packageSha256` equal to
   that review file digest and `expiresAt` set to an explicit UTC time within
   24 hours. After updating the maintenance log, run as root on Linux ARM64.

   ```sh
   sudo "$RELEASE_DIR/bin/node" "$RELEASE_DIR/ops/deploy.mjs" activate "$REVIEW_JSON" "$APPROVAL_JSON"
   ```

5. Inspect the protected deployment result, both unit states and effective
   release PIDs. Check public HTTPS `/api/health`, unauthenticated workspace
   rejection, denial of spoofed identity headers, valid owner login and secure
   session cookie, owner-scoped readiness, and logout/session revocation.
   Verify same-SHA worker heartbeat, data/history reads and bounded resource
   use for ten minutes. Reconcile the deployment lock once the observed outcome
   and both units are confirmed.

**Failure and undo.** A digest, configuration, schema or preflight mismatch
stops activation. On candidate startup/readiness failure the activator stops
the candidate and attempts the reviewed previous pair, then verifies readiness.
After a later access, heartbeat or resource failure, follow D's compatible
switch procedure. If a stop or fallback is uncertain, keep writers frozen,
inspect both pairs and preserve the lock and evidence before retrying. A
data restore requires the separate recovery decision in D.

### C. One-shot Drive recovery test

**Owner by hand.** Choose and record the backup-owning Google account
`<OWNER_BACKUP_GOOGLE_ACCOUNT>` and project `<GOOGLE_CLOUD_PROJECT>`. Sign in to
that exact account, enable Drive API for the dedicated project if needed, and
choose/create the dedicated **Desktop app** OAuth client
`<DRIVE_DESKTOP_CLIENT_ID>`. If the consent screen is in Testing, add your
backup account as the test user. Enter the client credentials yourself into
protected `rclone config`, select `drive.file`
(`https://www.googleapis.com/auth/drive.file`), and verify the account,
client and requested scope on Google's consent screen before authorizing.
The client, refresh token, config passphrase, crypt password and salt stay in
protected storage. Retain the crypt password and salt independently off Oracle.
Budget **10–20 minutes** for OAuth, **5–15 minutes** of writer downtime for the
snapshot, then **20–60+ minutes** for encryption, transfer and recovery.
[rclone Drive scopes](https://rclone.org/drive/#scopes)

1. Set up protected directories `runs`, `encrypted`, `retrieved`, and
   `restores` under the managed root. Set `cc-local` to type `crypt` pointing
   at `/var/lib/control-center/encrypted` with standard filename and directory
   name encryption. Set `cc-drive` to type `drive` with `scope = drive.file`.
   Check free quota and retention headroom privately. An rclone config password,
   if used, is supplied through protected `RCLONE_CONFIG_PASS`.
2. Sign in to the approved snapshot host. Set up owner-protected backup options
   JSON with keys `root`, `knowledge`, `release`, `rcloneConfig` and
   `externalWritersStopped`. Use `/var/lib/control-center` as `root`, its
   managed `knowledge` directory, the **currently running** release manifest
   plus its `manifestSha256` field, and the path to the protected rclone config.
   Set `externalWritersStopped` to `true` only after stopping both active
   units and verifying all external writers are quiesced. Supply protected
   `PGSERVICEFILE`/`PGPASSFILE` for `cc-backup`. Run `snapshot` once as in A
   and record the returned UUID. After a verified coordinated snapshot, resume
   the same units and owner access, then run `encrypt` for that UUID.
3. Approve exactly one ciphertext receipt, its UUID, byte count, hash and
   destination `cc-drive:control-center-encrypted-backups/<BACKUP_UUID>`.
   Hash `runs/<BACKUP_UUID>/encrypted-receipt.json` and the exact rclone config.
   Create the protected acknowledgement with `approvedBy: "owner"`,
   `action: "upload-one-backup"`, `id`, `receiptSha256`,
   `rcloneConfigSha256`, `destination` and an explicit `expiresAt` within
   24 hours. Upload that single UUID and confirm its immutable copy and remote
   ciphertext check pass.

   ```sh
   "$RELEASE_DIR/bin/node" "$RELEASE_DIR/ops/backup.mjs" upload \
     "$BACKUP_OPTIONS" "$BACKUP_ID" "$UPLOAD_APPROVAL"
   ```

4. On a separate approved Linux ARM64 recovery machine, stage the verified
   tooling, the snapshot release at its immutable path, and the retained
   ciphertext receipt at `runs/<BACKUP_UUID>/encrypted-receipt.json`. Prepare
   private recovery options pointing to a recovery rclone config. Recreate the
   crypt config from the independently retained secret and salt and provide
   the approved Drive access. Set `restoreSource` to `retrieved` so the test
   uses the downloaded bytes. Set `cc-restore` and `RESTORE_DATABASE_URL`
   to the same dedicated loopback scratch PostgreSQL instance, with credentials
   entered privately and no route to production. Retrieve, verify ciphertext,
   decrypt and create a disposable restore DB with the shipped tools.

   ```sh
   "$RECOVERY_TOOL_DIR/bin/node" "$RECOVERY_TOOL_DIR/ops/backup.mjs" retrieve \
     "$DRIVE_RESTORE_OPTIONS" "$BACKUP_ID"
   "$RECOVERY_TOOL_DIR/bin/node" "$RECOVERY_TOOL_DIR/ops/backup.mjs" restore \
     "$DRIVE_RESTORE_OPTIONS" "$BACKUP_ID"
   ```

5. Confirm `retrieved_and_verified` and `restore_verified` with the same UUID.
   Record the disposable database name and privately review exact schema,
   one owner, owner-scoped data and Markdown/history hashes. Compare the
   receipt, representative records and recovery duration with the snapshot.
   Keep the ciphertext, receipt and private proof. The approval covers one
   upload and recovery, with zero retention deletions and no recurring job.

**Failure and undo.** Check quota, consent or scope on OAuth failure. On
partial upload, inspect the retained attempt marker and remote receipt before
any retry. On a hash, wrong-key or restore failure, retain the ciphertext and
scratch evidence with production isolated. Release the write freeze and
recheck the original units if interrupted during snapshot. You can revoke the
test OAuth grant manually if access is no longer wanted. Leave the uploaded
object in place pending separately approved retention.

### D. Host rollback drill

**Owner by hand.** Sign in to `<ORACLE_HOST>` for the approved drill window.
Verify the running release and private env digests. Provide the owner login
for access checks and any recovery credentials privately. Approve **25–40
minutes** for a compatible switch, including **10 minutes of observation**.
Reserve **10–40+ additional minutes** for a data restore drill, subject to
volume. Agree on the exact restart target and failure cutoffs before stopping
services.

1. The last documented prior release is
   `d69a8c1345c1ef3cccd21341ea964a5bf2a1ce8c`, with matching
   `/etc/control-center/releases/<PREVIOUS_SHA>/{web,worker}.env`. Confirm its
   actual identity and record its manifest and both protected config hashes
   privately. That release expects 001–006 and refuses 001–009. To authorize
   a process-only switch after SQL, select a retained release with the exact
   nine-migration ledger and a verified password boundary. The proposed target
   for the compatibility rehearsal is `788a27783c7547ac34e8c4e684ce528ff35cba45`
   with tar SHA-256
   `685d75a98e669c8cc9ab3bcb6f91e1f0681f6dc238d2d2b10c6cd4a388b19285` and manifest
   SHA-256 `958a5ad22aff0dbaeea85647b9ebedb926fa486d742394dc352cab75de4b754b`.
   Its downloaded manifest has the identical nine entries and native CI passed
   password login and runtime-role checks. Record and verify its protected
   env digests privately. Rehearse both releases against a restored, isolated
   nine-migration copy before approving a host switch.
   Verify schema with `dist/migrate.mjs --check`, matching execution flags,
   owner login, anonymous denial and the matching worker heartbeat. There is
   currently no host-verified compatible target.
   [Prior ARM64 job](https://github.com/Clepperis/control-center/actions/runs/44901565159/job/136838375212) ·
   [Prior artifact](https://github.com/Clepperis/control-center/actions/runs/44901565159/artifacts/14706137958)
2. For an approved compatible host drill, freeze writes and record current
   units and readiness. Stop the active pair. Verify both are inactive before
   starting the exact approved previous pair.

   ```sh
   sudo systemctl stop "control-center-web@${ACTIVE_SHA}.service" \
     "control-center-worker@${ACTIVE_SHA}.service"
   sudo systemctl show -p ActiveState "control-center-web@${ACTIVE_SHA}.service" \
     "control-center-worker@${ACTIVE_SHA}.service"
   sudo systemctl start "control-center-web@${ROLLBACK_SHA}.service" \
     "control-center-worker@${ROLLBACK_SHA}.service"
   ```

   Perform B's health, owner access and same-release heartbeat checks.
   Stop the rollback pair and confirm both units are inactive. Start the
   original active pair again, repeat B's checks and observe for ten minutes
   before lifting the freeze. This path changes process/config only, with no
   data restoration and no discarded writes.

3. If the six-migration release is the only rollback target, run the **data
   recovery drill in isolation**. The designated recovery point is A's
   `<PRECHANGE_BACKUP_UUID>` at `<LAST_RETAINED_WRITE_UTC>` with
   `<BACKUP_RECEIPT_SHA256>`. Verify those fields against the receipt and
   restore its database and Markdown together using A's local restore steps.
   Run the six-migration release's schema and restore checker against that
   disposable copy and verify owner access and saved history there. This drill
   discards no production writes. A future live cutover to the restored point
   requires separate approval covering the actual cutoff and loss list.
   The live state would revert all later chats/messages, sessions and owner
   credential changes, Markdown/history/conflicts and later operational rows,
   including usage, tool calls, lessons and feedback. A verified continuous
   freeze from the snapshot through rollback can establish zero intervening
   writes. Keep the current live database and Markdown evidence intact until the
   owner decides. Keep B gated while the only available prior release needs a
   separately approved live data restore.

**Failure and undo.** If the previous pair refuses schema/readiness or access
checks, stop it, verify its processes exited and return to the verified original
pair if compatible with the untouched live data. Keep writes frozen if either
stop is uncertain or the original pair fails. Record the exact failing release,
unit state and checks before retry. A failed isolated restore leaves the
disposable DB and files available for diagnosis.

## Dependency audit

On 2026-11-21, both `npm audit` and `npm audit --omit=dev` reported zero
vulnerabilities (exit 0) on the unchanged candidate lockfile. It resolves
picomatch 4.0.7 and 2.3.2. GitHub withdrew GHSA-fc5q-39xc-vjpf on 2026-11-18
and lists no patched version. The npm registry's latest remains 4.0.7. No
dependency PR was opened. The earlier audit counts are historical.
[GitHub advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) ·
[npm registry version history](https://www.npmjs.com/package/picomatch?activeTab=versions)

## Status

| Category       | Evidence                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requested      | Updated release candidate and four separate owner approval packages in [draft PR #20](https://github.com/Clepperis/control-center/pull/20).                                                                                                                                                                                                                                                       |
| Implemented    | Candidate points to the post-#21 source. The artifact, manifest, SQL checksums and live-chat review decision are pinned above.                                                                                                                                                                                                                                                                    |
| Tested locally | Verified tar/manifest/source identity, nine SQL checksums, packaged ops parity and the prior artifact's hashes and nine-entry schema. Passed 13 deployment/password tests, both audit commands and documentation checks. The [November 18 rehearsal](INTEGRATION-VALIDATION.md#2026-11-18-local-release-package-revalidation) provides earlier PostgreSQL upgrade and encrypted restore evidence. |
| CI-verified    | [Exact source run](https://github.com/Clepperis/control-center/actions/runs/44902204714) passed Linux validation, native ARM64 build/execution, real PostgreSQL runtime checks and encrypted isolated restore.                                                                                                                                                                                    |
| Not done       | A–D require owner approval and execution. Host inventory, private hashes, compatible rollback, live Nexos, off-host Drive recovery, and post-activation observations remain unverified.                                                                                                                                                                                                           |
