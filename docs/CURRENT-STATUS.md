# Current integration and operations status

Reviewed 2026-11-17. This handoff supersedes status claims in older phase
documents. Credentials, infrastructure identifiers and private evidence stay
outside Git.

## Source and candidate

`main` still contains only the initial commit. The development target remains
`codex/phase-6-owner-auth-deployment` at `11b1475`.
`codex/integration-readiness` combines the following pending PRs for review;
it has not updated the target or running application.

| Source | Content                                                          |
| ------ | ---------------------------------------------------------------- |
| #9     | Deterministic automatic task analysis and model selection        |
| #10    | Paperclip goals, criteria, requested budget and approvals        |
| #11    | Agreed workspace plan and responsibilities                       |
| #12    | Browser dependency retries in CI                                 |
| #13    | Chat layout and demo notice                                      |
| #14    | Authenticated MCP Tool Hub; migration 008                        |
| #15    | Shared usage, metadata readers and quota expiry                  |
| #16    | Owner-reviewed lessons and feedback; migration 009               |
| #18    | Exact deployment manifest checks without a fixed migration count |

The candidate includes older review fixes from `2619c8d`, `7807761` and
`15870cf`: independent worker reconcilers, bounded CI evidence polling,
interrupted-turn recovery, knowledge matching, connection checks and security
headers. The old branch's later change to target `main` is excluded while
`main` is empty.

Integration preserves statistics and lessons, dynamic manifest checks after
migrations 008/009, and the Phase 6 worker heartbeat. All reconcilers run after
a failure, but readiness is refreshed only after every reconciler succeeds.
Tool Hub uses the SDK's 32,000-byte body limit and `Cache-Control: no-store`.
Login return destinations now include statistics and lessons. Legacy MCP uses
SSE; modern MCP may return JSON.

## Operations

Protected evidence records an Oracle web deployment on 2026-11-10: HTTPS,
owner login/logout, session revocation, restart persistence and private
readiness were verified. Later evidence records Nexos chat enabled while
delegation, n8n execution and coding remained disabled. This corrects older
documents' statement that nothing was deployed; it does not establish that
this candidate is deployed.

Public HTTPS probes on 2026-11-17 returned health 200, login 200 and workspace
401 without authentication. Public readiness returned 404. Private readiness
and the current source commit were not inferred from these public probes.

The connected Paperclip company and all five agents were paused. The previous
protected diagnostic identified a missing usage acknowledgement. Current pause
status is verified; accounting repair is not. No agents or budgets were changed.

The local usage collector completed a read-only sync without publishing agent
instructions. Claude quota is unavailable because its observation file is
missing. The configured writer already reads the official `rate_limits` fields;
they require a provider observation in an eligible session. See the
[official status-line documentation](https://code.claude.com/docs/en/statusline).
Token totals cannot establish subscription quota.

PR #15's old workflow remains queued without jobs. GitHub refuses cancellation
as completed and rerun as already running. This inconsistent service state is
not a code failure; fresh candidate CI is separate evidence. The old run was
not repaired.

## Next steps

1. Review the [2026-11-18 release-candidate package](RELEASE-CANDIDATE.md) first:
   exact cached artifact, fresh local checks, migration/grant and real local
   PostgreSQL restore evidence. Native execution was blocked on Windows. Resolve
   the live-model activation-policy mismatch and incompatible old-schema rollback
   before production approval. No real service was rechecked in that local task.
   Review the candidate and its checks, integrate into the development target,
   and explicitly reconcile superseded PRs. Choose the eventual `main` path.
2. Build the exact integrated native artifact. Review all nine migrations,
   coordinate a data/Markdown backup, apply SQL separately and reapply runtime
   grants. Activation never applies migrations.
3. Complete encrypted off-host backup retrieval, decryption and isolated restore,
   plus a compatible-release rollback drill. Retain the existing immutable
   release and protected configuration.
4. Recheck Oracle resources/configuration privately and prepare the exact
   artifact/config/schema/target approval package. Preserve existing live
   settings; test settings and examples must not replace production secrets.
5. Resolve Paperclip accounting, verify application contracts, then prove a
   separately bounded real task/coding run.
6. LJA remains design work: draft PR #17 closed without merging. CRM columns,
   event/audience, partner categories, an email example, limits and n8n Google
   credentials remain needed. Hermes/Telegram and voice follow the integrated
   foundation. See the [workspace plan](WORKSPACE-PLAN.md) for responsibilities.

## Dependency audit

The audit reports 16 high dependency findings derived from picomatch advisory
[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).
The registry's latest version is 4.0.7 and the advisory lists no patched version.
Five findings remain in the production-only audit because Better Auth's optional
Vitest peer includes the installed testing stack in that dependency graph.
Passing tests do not resolve the advisory.

Application source has no direct picomatch imports, which limits identified
exposure but does not prove zero transitive exposure. Do not force npm's
suggested Vitest/Next downgrades or patch a third-party parser without a separate
reviewed dependency change. Recheck the advisory and lockfile before release.

## Verification

See [integration validation](INTEGRATION-VALIDATION.md). Synthetic tests and
historical real deployment evidence are distinguished explicitly.
