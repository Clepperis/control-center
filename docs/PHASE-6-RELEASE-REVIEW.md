# Private release review worksheet (template, not authorization)

Copy this worksheet into protected operator storage. Never fill real addresses,
credential values, private logs or audit text into this public file. No live
deployment package is complete until every unresolved field is backed by evidence.

## Exact review package

Record source SHA, branch, CI run URL and native artifact tar/manifest SHA-256.
Record actual native test evidence and distinguish CI ARM64 from Oracle execution.
Download the exact reviewed artifact; verify hashes before extraction into the
new exclusive `/opt/control-center/releases/<sha>` directory and verify every
payload file before execution. Do not extract an arbitrary archive as root;
inspect entries for absolute/traversal paths/escaping links first. No production
secret or private data is an artifact input.

Record target Oracle machine-id hash, OS/architecture, public IPv4/IPv6, cloud
NSG/security-list rule IDs, OS firewall rules and existing ports/workloads. Record
the exact randomized DuckDNS name after provider availability/ownership check.
Describe DNS record(s), ACME issuance/renewal, chosen proxy and exact 80/443 rules,
including what IPv6 does. Reserve no wildcard rules and expose no 3210/5433 ports.
Include nginx syntax test and certificate-chain/name/expiry checks in verification.

Proposed protected layout and changes:

- Dedicated OS user/group `control-center`; private data mode 0700 and files 0600.
- Dedicated PostgreSQL 18 cluster on 127.0.0.1:5433, database `control_center`.
  Separate `cc_web`, `cc_worker`, operator and migration roles. Runtime roles have
  no owner-account/schema writes; worker has no auth-table rights. No Hostinger DB
  reads/writes. Record exact packages/version and dedicated cluster unit.
- Immutable `/opt/control-center/releases/<sha>`, root-owned and not writable by
  runtime. `/etc/control-center/releases/<sha>/{web,worker,operator}.env` is root
  0600; systemd reads the role-specific files. Deliver secrets using an approved
  secret store or operator terminal. Do not put them in shell history/chat.
- `/var/lib/control-center/knowledge` plus managed backup/recovery subdirectories;
  `/var/cache/control-center`; separate bounded journald namespace and nginx log
  rotation. Resolve hard disk quotas before approval (see limits document).
- Reviewed web/worker instance units and dedicated PostgreSQL resource drop-in.
  Existing workload units remain unchanged. Record effective CPU/memory/stop/start
  bounds, disk allocation and resource contention risk.
- Operator-controlled owner bootstrap with explicit persistent subject. No
  automatic reassignment of development data or approval subjects.

List each secret category, role and delivery method without values: web auth,
web/worker/operator/migration DB credentials; later gateway/n8n/Paperclip/repository
application access; separately authorized Drive OAuth/crypt recovery and deployment
operator access. Initial integration credentials are absent, all execution switches
false, and no new schedule is installed. Coding executor gets none of these secrets.

Review all migration SQL through this release and exact before/after manifests. Record either a verified
empty new database or a coordinated pre-change dump+Markdown/history and isolated
restore proof. Account/bootstrap is a separately recorded operator action after
SQL/grants. No startup migration. Phase 5 SQL remains usable but Phase 5's missing
password flow prevents an unqualified public application rollback to it.

Record expected downtime: first deployment has no prior Control Center service;
updates stop both app processes and may briefly return 502 while the reviewed
release starts. Coordinated backup pauses owner writes. Existing Oracle services
and Hostinger apps must remain available. Check real resource pressure before
starting; do not promise zero downtime or no contention.

Validation must include unauthorized API/page rejection, secure cookies, valid
owner login/logout and reset, persistence/restart, worker heartbeat/recovery,
readiness, HTTPS and external port checks. Define failure triggers and observation
window. Keep detailed diagnostics private. Reconcile ambiguous operations before
retrying; preserve the deployment lock and immutable releases.

## Activation JSON and acknowledgement

`review.json` must contain the exact values below, not placeholders. The file hash
is the package identity. `networkPlanSha256` binds a root-owned local
`/etc/control-center/network-plan.json` containing the exact network/proxy/unit and
storage plan, unit/config hashes, resource limits, expected downtime, provisioning
steps and recovery steps. Activation checks this hash; it does not independently
prove actual cloud/firewall rules, OS account permissions or owner approval.

```json
{
  "version": 1,
  "commit": "EXACT_40_HEX_SOURCE_SHA",
  "artifactSha256": "EXACT_64_HEX_TAR_HASH",
  "manifestSha256": "EXACT_64_HEX_RELEASE_MANIFEST_HASH",
  "targetMachineSha256": "SHA256_OF_EXACT_ETC_MACHINE_ID_BYTES",
  "hostname": "REVIEWED_LABEL.duckdns.org",
  "port": 3210,
  "dataRoot": "/var/lib/control-center",
  "executionEnabled": false,
  "migrationsAppliedSeparately": true,
  "schema": [
    {
      "name": "EACH_EXACT_MIGRATION_NAME_FROM_RELEASE_MANIFEST",
      "checksum": "EACH_HASH"
    }
  ],
  "configSha256": { "web": "EXACT_HASH", "worker": "EXACT_HASH" },
  "networkPlanSha256": "EXACT_HASH",
  "recovery": { "emptyInitialDatabase": true },
  "previous": null
}
```

Copy the complete ordered `schema` array from the exact release's `release.json`;
the number of migrations grows with the release. Do not truncate it to an earlier
phase's migration count. Activation requires an exact name/checksum/order match
against the verified artifact, and the database compatibility check still rejects
missing, changed or newer applied migrations. Deployment never applies migrations.

For existing data, `recovery` instead contains `emptyInitialDatabase:false`,
`proofSha256` and `backupReceiptSha256` matching the protected
`/var/lib/control-center/{recovery-proof,prechange-backup-receipt}.json` files.
Review their contents and freshness, not just their hashes. For a previous release,
record its exact commit, manifest/config hashes, `supportsCurrentSchema:true` and
`passwordBoundaryVerified:true`, supported by actual prior tests. Keep its artifact,
configuration and consistent data recovery point available. Freshness/compatibility
attestations are operator review, not automatically proven by those booleans.

Only after the owner approves the complete package, place a protected acknowledgement:

```json
{
  "approvedBy": "owner",
  "action": "activate",
  "packageSha256": "HASH_OF_EXACT_REVIEW_JSON_FILE",
  "expiresAt": "EXPLICIT_UTC_TIME_WITHIN_24_HOURS"
}
```

This is an operator procedure and stale-input guard, not a signed identity/approval
service. The implementation agent cannot create it as a substitute for owner
consent. Material commit/artifact/config/target/migration/effect changes require a
new review and approval. Activation never installs prerequisites, mutates DNS,
changes firewalls/proxy, applies SQL, restores production or buys anything.

After activation inspect result, real unit PIDs/status and both health layers;
verify owner access, denied unauthenticated access and private internal listeners.
Only then reconcile/remove its retained lock. Do not automatically repeat it.

## Rollback and backup review

Record exact previous web+worker artifact, protected config, schema compatibility
and Markdown consistency. Health failure can roll back processes/config only if
that compatibility was reviewed. If data restore is required, state the exact
latest write time retained and all subsequent data lost, obtain separate approval,
test isolated restore first and never restore over production automatically.

For initial Drive authorization record account type/free quota, dedicated OAuth
client, exact `drive.file` scope, local encrypted config and off-Oracle recovery
secret storage. This is independent from application login. Approve one exact
ciphertext test UUID/receipt/bytes/destination; no plaintext upload, mirror,
retention deletion or recurring schedule. Upload acknowledgement additionally
requires `action:upload-one-backup`, `id`, `receiptSha256`, `rcloneConfigSha256`,
exact `destination:cc-drive:control-center-encrypted-backups/UUID` and an expiry
within 24 hours. Refresh tokens stay private; changed authorization/account scope
needs review. Prove download, decryption, SQL/Markdown restore and application
checks in disposable storage, not upload alone. Retention caps are 30 versions /
20 GiB; deletion and any future schedule require a separate exact review.

## Current blockers before filling this package

Provider hostname availability/account authorization and real TLS issuance; OCI
rules/public reachability and IPv6 design; hard storage quotas and resource
coexistence; separately delivered runtime/operator secrets and owner bootstrap;
actual Oracle runtime tests; real encrypted Drive upload/retrieval/restore and a
compatible previous release/rollback drill. No owner approval is implied by this
worksheet or by a successful CI run.
