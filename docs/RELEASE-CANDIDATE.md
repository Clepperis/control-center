# Phase 6 release-candidate review package

Prepared 2026-11-18, local work only. **Review package, not deployment approval.**
Activation is blocked by the live-model policy mismatch and unestablished
compatible rollback described below. No target, secrets, accounts or external
services were accessed. Git fetch/push and the requested draft PR are repository
delivery operations, separate from runtime verification.

## Exact revision and artifact

| Item                             | Exact identity                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Validated payload source branch  | `codex/integration-readiness`                                                       |
| Starting and artifact source SHA | `6818cefc63d167687a0227fa592d4879033b38d7`                                          |
| Review documentation branch      | `codex/release-candidate-package`, created from that exact origin commit            |
| PR target                        | `codex/phase-6-owner-auth-deployment` at `11b147506d0675b30eef2476a28ec96a35e3f34b` |
| Cached artifact                  | `control-center-6818cefc63d167687a0227fa592d4879033b38d7-linux-arm64.tar.gz`        |
| Size                             | 176,859,930 bytes                                                                   |
| Tar SHA-256                      | `7714ddbedd7c226b46f14bb9c4c0d17303ae8f941f8be97f581c58e0ef4a3a24`                  |
| Release-manifest SHA-256         | `d5940c620d3251e29dfe6d3961f664d166c941bf6ec315a7eb9ad2b20e1c4262`                  |
| Manifest platform/architecture   | Linux / ARM64                                                                       |

The documentation commit is **not** the artifact's embedded source commit.
Approval must bind the payload SHA and hashes above, never a moving branch or
the later documentation-only PR head. Any application, SQL, ops or configuration
change requires a new review and, where applicable, a new native artifact.

No ARM64 artifact was built or executed in this run. On Windows x64,
`npm run build:release` exited 1 with `native_linux_arm64_required`, and
`node scripts/verify-native-artifact.mjs` exited 1 with the native-platform
assertion. These guards were retained. The already-cached artifact's tar hash,
manifest hash, embedded source/platform/architecture and nine migration hashes
were checked locally without extracting or executing it. Historical
[source CI](https://github.com/Clepperis/control-center/actions/runs/44184302090)
is dated 2026-11-17; it is not fresh ARM64 verification for this local run or proof
of execution on the target. No CI job was dispatched for this task.

## Target and process layout

All target-specific fields remain placeholders: `<ORACLE_HOST>`,
`<ORACLE_MACHINE_FINGERPRINT>`, `<APP_ORIGIN>`, `<EXISTING_NETWORK_PLAN_HASH>`,
`<PREVIOUS_RELEASE_SHA>`, `<PROTECTED_CONFIG_HASHES>` and `<BACKUP_RECEIPT_HASH>`.
They must be completed privately during a separately authorized host review.
This public package is not an executable `review.json` or acknowledgement.

- Native, immutable release directory `/opt/control-center/releases/<RELEASE_SHA>`;
  dedicated runtime identity, separately bounded web and worker systemd units.
- Web binds only the existing private listener; worker has no public listener.
  Reuse the existing HTTPS proxy, hostname and certificate arrangement unchanged.
- Separate protected web/worker configuration under
  `/etc/control-center/releases/<RELEASE_SHA>/`; operator/migration access stays
  outside runtime processes. Preserve the existing release and its configuration.
- Dedicated application PostgreSQL and authoritative private Markdown/history
  remain in their existing locations. No container, second application database
  on a production service, new schedule or infrastructure reprovisioning.

## Configuration review: names only

Comparison uses the public source of the last documented deployed baseline
`d69a8c1345c1ef3cccd21341ea964a5bf2a1ce8c`. Actual server configuration and current
deployment were **not** inspected; the operator must confirm drift privately.

| Group                     | Environment variable names                                                                                                                               | Change/preservation rule                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Web identity and sessions | `AUTH_MODE`, `APP_ORIGIN`, `OWNER_SUBJECT`, `AUTH_SECRET`                                                                                                | Existing; preserve exact subject, origin and secret. No bootstrap, account transfer or reset.                                               |
| Storage and release       | `DATA_MODE`, `DATABASE_URL`, `KNOWLEDGE_ROOT`, `RELEASE_COMMIT`, `HOSTNAME`, `PORT`                                                                      | Existing; preserve storage and role separation. Release identity changes only to the exact approved payload.                                |
| Worker                    | `DATABASE_URL`, `KNOWLEDGE_ROOT`, `RECONCILE_INTERVAL_MS`, `RELEASE_COMMIT`                                                                              | Existing; separate worker DB role; no auth, deployment or backup secrets.                                                                   |
| Nexos                     | `NEXOS_API_KEY`, `NEXOS_MODEL`, `NEXOS_MAX_COMPLETION_TOKENS`, `NEXOS_TIMEOUT_MS`, `LIVE_MODEL_ENABLED`                                                  | Existing; preserve the owner's approved key, selected model, bounds and enabled chat setting.                                               |
| Tier routing              | `NEXOS_MODEL_FAST`, `NEXOS_MODEL_STANDARD`, `NEXOS_MODEL_STRONG`                                                                                         | New since the documented baseline; optional. Omission retains the existing default model; assigning tiers needs explicit model/cost review. |
| Tool Hub                  | `TOOL_HUB_TOKEN`                                                                                                                                         | New, optional. Leave unconfigured unless separately approved; no token generation/distribution here.                                        |
| Shared-usage reader       | `USAGE_SNAPSHOT_FILE`                                                                                                                                    | New, optional private aggregate path. Missing input is unavailable, never fabricated usage.                                                 |
| Separate collector        | `USAGE_WINDOW_DAYS`, `USAGE_SYNC_INTERVAL_MS`, `USAGE_PAPERCLIP_AGENT_IDS`, `USAGE_CODEX_ROOTS`, `USAGE_CLAUDE_ROOTS`, `USAGE_CLAUDE_QUOTA_FILE`         | New, optional collector settings. No collector schedule, local-log copying to Oracle or instruction publishing is included.                 |
| Delegation                | `LIVE_DELEGATION_ENABLED`, `PAPERCLIP_CONTRACT_VERIFIED`, `PAPERCLIP_BASE_URL`, `PAPERCLIP_BOARD_API_KEY`, `PAPERCLIP_COMPANY_ID`, `PAPERCLIP_AGENT_IDS` | Existing; delegation remains disabled. Do not create credentials, resume agents or change budgets.                                          |
| Automation                | `N8N_EXECUTION_ENABLED`, `N8N_ORIGIN`, `N8N_MCP_TOKEN`, `N8N_TIMEOUT_MS`, `N8N_TEXT_WORKFLOW_ID`, `N8N_TEXT_WORKFLOW_VERSION`                            | Existing; execution remains disabled. No workflow creation, publication or execution.                                                       |
| Coding                    | `IMPROVEMENT_EXECUTOR_ENABLED`, `IMPROVEMENT_REPOSITORY`, `IMPROVEMENT_TARGET_BRANCH`, `IMPROVEMENT_GITHUB_READ_TOKEN`, `IMPROVEMENT_POLICY_FILE`        | Existing; executor remains disabled. Do not silently retarget to the initial-only `main` branch.                                            |
| Operator only             | `OPERATOR_DATABASE_URL`, `MIGRATION_DATABASE_URL`                                                                                                        | Existing; explicit operator operations only. Never pass to web, worker or executor.                                                         |
| Backup operator           | `PGSERVICEFILE`, `PGPASSFILE`, `RESTORE_DATABASE_URL`, `RCLONE_CONFIG_PASS`                                                                              | Existing tooling inputs, not application settings. Retain protected configuration; do not copy into runtime env files.                      |

### Activation policy mismatch: unresolved blocker

The requested effects preserve Nexos chat enabled. However, `verifyConfig` in
`ops/deploy.mjs` requires **all four** execution switches, including
`LIVE_MODEL_ENABLED`, to be disabled. The existing activator therefore rejects
the requested live-model configuration. `review.executionEnabled` does not
provide an exception for chat.

Do not disable existing chat just to satisfy the guard, forge an acknowledgement,
edit the protected configuration, or bypass activation checks. This package
records the conflict; a separate reviewed implementation/policy change with
tests and a refreshed artifact is required before this activator can deliver the
requested effects. No activation-readiness claim is made.

## Schema and migration review

The public source of the last documented deployed baseline contains 001–006.
Therefore **007, 008 and 009 are new relative to that baseline**. Server drift
is unknown until an authorized private ledger read. Never infer the production
schema from the development checkout.

| Order / filename        | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `001_foundation.sql`    | `c00b67edfdb0a70e8c79f190b5d6f455906e433c5f4ae3126b25825f3e351ba0` |
| `002_orchestration.sql` | `0a830ffef3ef34b7738d747c8d944da1284ce04e817bcfe3e10de82cf58af7cb` |
| `003_automations.sql`   | `963ed73006f741998e12e81481d9c087ba132ae2a4d90024de56c37d38d479dc` |
| `004_knowledge.sql`     | `77304113926cd0269a366eee7925edd2be34057d7eeb791d741a0e472a37085d` |
| `005_improvements.sql`  | `11a1ec1e7e8d78ad49b2feebd42814b7fc03dfd59f17de8752aa708c90baf78f` |
| `006_owner_auth.sql`    | `a25b5526e24cedf857f43f5becb91e3149eb442f60768b8989c6e5d5513b29b2` |
| `007_model_usage.sql`   | `d530823bd784894d06f2fe0041231f04f1e44aa0bf438213d1608a43aa8aef42` |
| `008_tool_calls.sql`    | `3bd5a426733f47677bdc3fce76b0e7a70cbcd26555947e5ad48b6adf0eac0b02` |
| `009_lessons.sql`       | `b3d86693ebec7248e58650186e41e59db9e25ff59d56a382fc32dfde57c0d879` |

### Executed local database checks

Used a newly initialized PostgreSQL **18.6 server on Windows x64**, bound to a
fresh loopback listener, with synthetic data and dedicated synthetic roles.
This migration/restore rehearsal used real PostgreSQL, not PGlite. The ordinary
unit suite separately uses PGlite and provider substitutes.

1. Confirmed the scratch public schema had zero tables. Applied all nine SQL
   files through the application's transactional, checksum-checked migrator.
2. Re-ran the migrator. All nine ledger entries, checksums and timestamps were
   unchanged; `checkSchema` matched the manifest exactly.
3. In another scratch DB, applied 001–006, created a synthetic owner, conversation,
   answer, Markdown document and revision history, then took a custom-format
   `pg_dump` plus Markdown copy **before** 007–009.
4. Applied through 009 and confirmed the existing row counts were preserved.
   Verified the old six-migration schema check rejects the upgraded database.
5. Applied the shipped grants with synthetic role substitutions; new-table reads
   worked after grants while worker auth reads and web credential/schema writes
   remained denied. No production grant statement was executed.

Production sequence remains: stop owner/external writes and both app processes,
capture the coordinated pre-change database + Markdown/history/conflicts backup,
verify isolated recovery, then explicitly apply SQL and reapply grants. The
whole migration batch uses one transaction and advisory migration lock. Operator
lock/statement timeouts and actual schema drift must be reviewed before SQL.
Application startup and activation **never** apply migrations.

### 008: additive Tool Hub audit trail

New table `tool_calls`: `id uuid` PK; `created_at timestamptz`; `tool text`;
`outcome text`; nullable `error_code text`; `duration_ms integer`; nullable
`approval_ref text`. SQL bounds tool/error/reference lengths, outcome and
nonnegative duration. It stores no tool arguments or results.

Indexes: PK index `tool_calls_pkey`; B-tree `tool_calls_created(created_at)`.
This creates an empty table and indexes; it alters/re-writes no existing table.
Normal DDL/catalog locks still apply. It adds no existing-data backfill.

### 009: additive learning and feedback

New `lessons` columns: `id uuid` PK, `owner_subject text`, `scope text`,
`text text`, `text_key text`, `source text`, `state text`, `occurrences integer`,
nullable `evidence text`, `created_at timestamptz`, nullable `decided_at timestamptz`.
Defaults: global scope, proposed state, one occurrence and current creation time.
SQL constrains lengths, source/state enums and positive occurrences.

Indexes: `lessons_pkey`, unique `lessons_owner_subject_scope_text_key_key`
on `(owner_subject,scope,text_key)`, and `lessons_owner_state` on
`(owner_subject,state,created_at DESC)`.

New `message_feedback` columns: `message_id uuid` PK **and FK to existing
`messages(id)`**, `owner_subject text`, `rating smallint`, nullable `note text`,
`created_at timestamptz`. Rating and note length are constrained. Index:
`message_feedback_pkey`. There is no extra owner index and no added column on
`messages`.

No existing table is rewritten or backfilled, and the new tables start empty.
However, the FK is not lock-free: a local `pg_locks` probe during 009 observed
`ShareRowExclusiveLock` on existing `messages`, plus locks on the new relations.
That lock conflicts with ordinary writes and is held until transaction end.
Quiesce writers, bound lock waits and roll back the SQL transaction on failure;
do not treat “additive” as a zero-downtime guarantee.

### Runtime grants after SQL

Run the shipped `ops/postgres/roles.sql` against the approved application DB with
private operator authentication and placeholder roles replaced locally:

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO "<WEB_RUNTIME_ROLE>", "<WORKER_RUNTIME_ROLE>";
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public
  TO "<WEB_RUNTIME_ROLE>", "<WORKER_RUNTIME_ROLE>";
REVOKE ALL ON schema_migrations FROM "<WEB_RUNTIME_ROLE>", "<WORKER_RUNTIME_ROLE>";
GRANT SELECT ON schema_migrations TO "<WEB_RUNTIME_ROLE>", "<WORKER_RUNTIME_ROLE>";
REVOKE ALL ON auth_user,auth_account,auth_session,auth_verification,auth_login_budget
  FROM "<WEB_RUNTIME_ROLE>", "<WORKER_RUNTIME_ROLE>";
GRANT SELECT ON auth_user,auth_account TO "<WEB_RUNTIME_ROLE>";
GRANT SELECT,INSERT,UPDATE,DELETE ON auth_session,auth_login_budget TO "<WEB_RUNTIME_ROLE>";
```

In particular, the shipped all-table grant includes the following new-table
privileges. Their explicit equivalent is:

```sql
GRANT SELECT,INSERT,UPDATE,DELETE
  ON public.model_usage,public.tool_calls,public.lessons,public.message_feedback
  TO "<WEB_RUNTIME_ROLE>", "<WORKER_RUNTIME_ROLE>";
```

These are the existing broad application CRUD grants, not a claim of complete
per-operation least privilege. No sequences are introduced by 007–009. Do not
grant owner credentials, schema ownership or migration rights to runtime roles.

## Intended external effects after an approved activation

- Preserve enabled Nexos chat and its existing model/token/timeout bounds. Chat,
  scoped knowledge answers and explicit planning requests can spend through the
  gateway; activation itself must not perform a paid test or background completion.
- Delegation, n8n execution and the coding executor stay disabled. No agents,
  budgets, workflows, messages or branch protections change.
- New Tool Hub access stays unconfigured unless separately approved. Agent
  proposals still require owner review; lessons never self-approve.
- No Drive authorization/upload, backup scheduler, collector publisher, DNS or
  certificate operation is part of activation.

The present activator cannot yet realize the first bullet; see the blocker above.

## Validation plan after activation — not executed here

Using the exact approved target and retained release/configuration evidence:

1. Inspect actual web/worker unit PIDs, source release and bounded resource use.
   Public HTTPS health must return success with valid existing TLS.
2. Owner login succeeds with a Secure/HttpOnly/SameSite session cookie. A separate
   client without cookies gets workspace 401; identity headers grant no access.
3. Run private readiness as the application identity: exact nine-migration
   checksums, storage/history/conflicts access, disk reserve and a recent worker
   heartbeat bearing the **same** release commit. Public readiness stays hidden.
4. Logout revokes that session; reuse fails. Test global reset revocation only
   with a separate account-recovery approval, because it invalidates all sessions.
5. In the approved observation window, restart web and worker, confirm stored
   owner/data/session persistence and resumed heartbeat/reconciliation. Do not
   resubmit an uncertain external task.
6. Observe for at least five minutes after recovery. Health, access or heartbeat
   failures trigger stop-and-reconcile, retaining the deployment lock and evidence.
   A paid Nexos answer test needs its own bounded approval and is not implied.

## Backup and rollback rehearsal/procedure

### Executed locally

Real PostgreSQL custom-format dump and Markdown/history copy were made with no
active local application writers. The systemd quiescence observer was a
deterministic no-writer substitute; no service manager was contacted.

Real rclone 1.76.0 `crypt` encrypted the snapshot. Ciphertext was copied to a
**local directory standing in for off-host storage**, copied back to the
retrieval directory, checked against the receipt and decrypted. No Drive remote
was configured or contacted. `pg_restore --exit-on-error --no-owner
--no-privileges` restored into a new scratch DB. The actual
`node --import tsx scripts/restore-check.ts` returned `restore_verified` for
one owner, one document and two historical revisions, after exact schema and
Markdown hash checks. The combined tiny-fixture rehearsal took about 6.4 seconds;
this is not a production recovery-time objective.

The separate `npm run test:backup` also passed wrong-key, tamper, duplicate and
unapproved-upload checks; its default mode does **not** restore a DB. The real
PostgreSQL restoration above is separate evidence. Scratch databases/files were
retained privately; the dedicated local cluster was stopped after the rehearsal.

### Future host procedure and estimates

1. **Pre-change snapshot:** privately verify schema/config/release identities;
   quiesce web, worker and other writers; take coordinated DB + Markdown/history
   backup and record its last retained write time. Estimate 5–15 minutes for a
   small installation, subject to actual volume and locks.
2. **Encrypted off-host copy:** encrypt locally, check ciphertext/receipt, then
   obtain approval for one exact backup UUID, ciphertext bytes/hash and Drive
   destination using approved `drive.file` authorization. Copy/check only that
   ciphertext; no sync/deletion/schedule. Estimate 5–30+ minutes, bandwidth bound.
3. **Retrieval/decryption:** retrieve into a new private directory, verify the
   receipt and decrypt with an independently retained recovery secret/config.
   Estimate 5–20+ minutes. Oracle/Drive and the independent recovery copy remain
   unverified by this local exercise.
4. **Isolated restore:** restore to a new loopback scratch DB/directory and run
   the exact artifact's `restore-check`, schema, owner and Markdown checks.
   Estimate 5–20+ minutes; never restore over production as a rehearsal.
5. **Compatible process/config rollback:** retain the previous immutable artifact
   and protected configuration; verify its exact schema/password boundary before
   stopping/starting the web/worker pair. Estimate 5–10 minutes after compatibility
   is established, followed by at least five minutes of observation.

**Rollback blocker:** the locally tested six-migration baseline refuses the
nine-migration schema even though 007–009 are additive. Do not assert
`supportsCurrentSchema` or automatically start that old release against it.
No compatible previous nine-migration release has been established here.
Either establish and test one, or separately approve a coordinated data + Markdown
restore to a known recovery point, with explicit downtime and loss of all later
writes. Estimated data restore is 10–40+ minutes, volume dependent. A deterministic
deployment transition test is not an actual systemd/Oracle rollback drill.

## Local command record

Fresh checks ran in an isolated detached copy of the exact payload SHA, with
no `.env.local`, cleared inherited application/PG credentials, telemetry disabled,
and external execution disabled. Full commands, timestamps, exits and detailed
private logs are retained locally. `<SCRATCH_...>` below replaces local paths;
no production values were used. No failing test was removed or weakened.

| Command                                                                                         | Exit | Short result                                                                                     |
| ----------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------ |
| `npm ci`                                                                                        | 0    | Clean locked install; audit warning retained, no version changes                                 |
| `npm run lint`                                                                                  | 0    | Passed                                                                                           |
| `npm run typecheck`                                                                             | 0    | Passed                                                                                           |
| `npm test`                                                                                      | 0    | 267 tests, 27 files passed                                                                       |
| `npm run build`                                                                                 | 0    | Production build passed on Windows x64                                                           |
| `npm run build:runtime`                                                                         | 0    | Worker/operator bundles built                                                                    |
| `npm run test:boundary`                                                                         | 0    | Production anonymous/bypass boundaries passed                                                    |
| `npm run test:backup`                                                                           | 0    | Local cryptography/negative controls; default mode has no DB restore                             |
| `npm run test:password:ui`                                                                      | 0    | Synthetic HTTPS production app, login/CSRF/reset, MCP/lessons and mobile passed                  |
| `npm run test:ui:live`                                                                          | 0    | Operational UI/lifecycle with deterministic external substitutes passed                          |
| `npm run test:chat:ui`                                                                          | 0    | Composer keyboard/recovery/responsive checks passed                                              |
| `npm run test:ui`                                                                               | 0    | Isolated demo interactions passed                                                                |
| Initial `npm run test:a11y` without `UI_BASE_URL`                                               | 1    | Wrong local default origin; `Cannot GET /chat`; assertions retained                              |
| `npm run test:a11y` with `UI_BASE_URL=<LOCAL_DEMO_ORIGIN>`                                      | 0    | Same suite against isolated app; ten routes, three widths, AA and keyboard                       |
| `npm run build:release`                                                                         | 1    | Blocked: native Linux ARM64 required; no new tar built                                           |
| `node scripts/verify-native-artifact.mjs`                                                       | 1    | Blocked by platform assertion before reading/executing an artifact                               |
| `initdb -D <SCRATCH_PGDATA> -U rc_operator --auth=trust --encoding=UTF8 --no-locale`            | 0    | Dedicated synthetic loopback PostgreSQL cluster only                                             |
| `node --import tsx <LOCAL_HARNESS>/rehearse.ts <SCRATCH_ROOT> <SCRATCH_PORT> <CACHED_TAR>`      | 0    | Real PG migration/idempotency, pre-change backup, upgrade/grants and encrypted restore           |
| `node --import tsx scripts/restore-check.ts`                                                    | 0    | Separate scratch DB/Markdown verified after `pg_restore`                                         |
| `node --import tsx <LOCAL_HARNESS>/locks.ts <SCRATCH_ROOT> <SCRATCH_PORT>`                      | 0    | Observed 009's existing-table lock during the transaction                                        |
| `node <LOCAL_HARNESS>/verify-cached-artifact.mjs <CACHED_TAR> <CACHED_IDENTITY> <LOCAL_RESULT>` | 0    | Cached tar/manifest/source/architecture labels and nine SQL checksums match; no native execution |

The first local harness setup attempt exited 1 because its relative imports were
copied one directory too high. The fixture placement was corrected and the full
rehearsal rerun. A relative wrapper invocation was also corrected after a working
directory change. The first a11y invocation lost its explicit demo origin across
shell calls and hit the wrong local default; the same unchanged suite was rerun
with `UI_BASE_URL` set to the isolated app. These are recorded invocation errors,
not removed/relaxed assertions. No application fix or dependency change was needed.
The two native commands' nonzero exits remain unsupported-platform results.

## Known limitations

- Picomatch advisory [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
  remains a release risk. The fresh install reports 16 high dependency findings;
  no forced downgrade, override or audit suppression was applied. No fresh
  upstream advisory query was made in this local-only task.
- Real Nexos/Paperclip/n8n contracts and a bounded real coding workflow are not
  newly verified here. No paid completion or external integration probe ran.
- Branch protection was last documented as unprotected; it was neither inspected
  nor changed here. Coding stays disabled until protection and runtime gates are
  separately verified.
- Missing Claude quota observation remains unknown. No synthetic percentages or
  token-based allowance were substituted and no local personal log collector ran.
- PR #15's inconsistent queued workflow is historical context from current status,
  not freshly rechecked or repaired here.
- No fresh ARM64 execution, current Oracle inventory/readiness, off-host/Drive
  recovery or host-compatible rollback was established. Earlier evidence must
  retain its date/source and cannot become this run's deployment evidence.

## Separate status categories

| Category                  | Status and evidence                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| requested                 | Local release review package and draft PR requested; no runtime action authorized                                   |
| implemented               | Existing payload at the exact source SHA; this branch adds the review documentation                                 |
| tested locally            | Fresh Windows x64 checks plus real isolated PostgreSQL 18.6 migration/restore and cached artifact hash checks       |
| deterministic substitutes | Unit/provider adapters, PGlite tests, synthetic loopback TLS, no-writer observer and local off-host-copy substitute |
| real external service     | None contacted for runtime verification; no Oracle, DNS, certificates, Drive, model or Paperclip access             |
| ARM64                     | Fresh build/execution blocked on this Windows host; cached artifact/dated CI evidence is not fresh verification     |
| deployed                  | This candidate was not deployed by this task; previous host release/configuration preserved untouched               |
| verified after deploy     | Not performed; the validation plan above remains pending                                                            |

## Exact remaining owner approvals

After resolving the activation/rollback blockers and refreshing affected artifact
identity, obtain **separate, concrete approvals** for:

1. **Server SQL:** exact unapplied migration names/checksums, coordinated pre-change
   backup/recovery proof, maintenance window and runtime grants on `<ORACLE_HOST>`.
2. **Production activation:** exact source/tar/manifest/target/config/network hashes,
   intended effects, observation window and reviewed rollback plan. Review the
   completed private package before producing its expiring acknowledgement.
3. **Drive recovery test:** any initial account/client/scope authorization plus one
   exact ciphertext backup UUID/hash/size/destination, retrieval/decryption and
   isolated restore using the independent recovery secret. No retention deletion
   or recurring schedule is implied.
4. **Host rollback drill:** exact compatible release/configuration and maintenance
   window; if data restore is required, explicit recovery point and accepted loss
   of later writes. Never use a process rollback approval as data-restore consent.

Neither a draft PR nor passing local tests grants these approvals. No merge to
`main` or the development target is included in this package preparation.
