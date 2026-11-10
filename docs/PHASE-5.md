# Phase 5: Platform Engineer and Improve System

## Delivered behavior and verification boundary

`/improve` is a dedicated Lithuanian workspace with private persistent request
conversations, selected-code investigation, versioned plans, explicit
implementation consent, durable worker steps, external task/workspace references,
exact candidate diffs, CI evidence, structured owner self-review and separate
manual integration consent. Demo mode preserves local drafts and never calls a
model. Live mode requires the existing application PostgreSQL and owner guard.

This implementation is **not live coding verified**. Read-only development MCP
confirmed Paperclip access and a paused agent; no ready coding runtime was
established. No application credentials were borrowed from this Codex session.
No paid completion, separate coding run, PR merge, deployment, recurring monitor
or external settings change was performed. Deterministic substitutes exercise
the lifecycle without pretending to be execution capability.

## Responsibilities and executor choice

| Component                        | Responsibility                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Control Center UI/API            | Owner conversation, immutable consent boundaries, review and manual handoff                            |
| `server/improvements/service.ts` | Bounded planning coordination, durable state transitions and leases                                    |
| Existing worker / PostgreSQL     | Recoverable job delivery and read reconciliation; no second scheduler                                  |
| `PaperclipCodingExecutor`        | One private delegated coding task with fixed agent/project/environment and isolated workspace settings |
| Paperclip + configured runtime   | Task lifecycle, authenticated coding, filesystem/process/network/credential limits and cancellation    |
| Git / GitHub read adapter        | Pinned source revisions, branch heads, exact diffs and ancestry                                        |
| GitHub Actions                   | Actual process validation for the candidate commit                                                     |
| Phase 4                          | Explicitly selected project/global retrieval; Markdown remains authoritative                           |
| n8n                              | Existing automation execution and business schedules                                                   |

Paperclip remains the single production-intended adapter. Current official
[Issues API](https://docs.paperclip.ing/reference/api/issues/),
[workspace guide](https://docs.paperclip.ing/guides/projects-workflow/workspaces/),
[Codex adapter](https://docs.paperclip.ing/reference/adapters/codex/) and
[sandbox provider reference](https://docs.paperclip.ing/reference/adapters/sandbox-providers/)
were inspected. Their current schemas support `isolated_workspace`, explicit
base/branch/environment settings, task/workspace reads and `interrupt` on a task
comment. The installed instance's application REST write/workspace/cancellation
shapes remain unverified. No speculative alternative executor was added.

The adapter never accepts executable commands, adapter overrides, credentials,
repository URLs or environment settings from model output. Work instructions are
data in a private task, not authorization. A successful task creation/status is
not evidence of code or tests. Before accepting running/completed work, workspace
reads must match the single allowed repository, pinned base, unique branch and
an external workspace ID. Unknown shapes fail closed.

## Setup without credential sharing

1. Use a local application PostgreSQL, `DATA_MODE=live`, the existing owner
   authentication setup, and `npm run db:migrate`. Run `npm run worker` beside the
   web application. Migration 005 adds only application-owned records; no
   Paperclip/n8n internal database changes.
2. Configure the existing nexos gateway for discussion/planning, with its own
   exact model and server-side key. Keep `LIVE_MODEL_ENABLED=false` until model
   use is authorized. Missing model access preserves the request and any source
   context already read; the owner may write a bounded plan after investigation.
3. Set the allowed GitHub repository and actual integration target in
   `IMPROVEMENT_REPOSITORY` / `IMPROVEMENT_TARGET_BRANCH`. The default target is
   the Phase 5 branch, because `main` lacks the earlier work. GitHub reads use
   fixed official API origins. An optional repository-scoped Contents/Actions
   **read** token avoids low anonymous rate limits. See the official
   [contents](https://docs.github.com/en/rest/repos/contents) and
   [workflow runs](https://docs.github.com/en/rest/actions/workflow-runs) APIs.
4. Separately configure application Paperclip operator access, allowed agent IDs
   and installed-contract verification using the Phase 2 setup. Runtime model
   authentication and repository **write** access belong to the selected
   Paperclip environment; they are never supplied by the web client or by this
   application's gateway/GitHub-read credentials.
5. An operator must verify an isolated environment with hard runtime/spend/disk/
   output limits, minimal environment and controlled egress. The coding process
   must have no production credentials/mounts, owner checkout, personal files,
   browser profile, policy file, Docker socket or application operator key.
   Ordinary tasks cannot modify auth, approval/configuration code, policy files,
   repository instructions, consent-domain schemas, existing orchestration/
   automation approval services, the canonical digest helper, dependency
   manifests, workflows or migrations.
   This release deliberately blocks those changes; they require a separate
   development authorization boundary.
6. Copy [the intentionally invalid policy example](executor-policy.example.json)
   to an operator-owned file **outside the checkout and every agent workspace**.
   Restrict write access to the operator. Set `IMPROVEMENT_POLICY_FILE` to its
   absolute path. Replace IDs, timestamps and hashes only after verification.
   The parser rejects inside-checkout paths, a symlink policy file, oversized
   files, false attestations, wrong repositories, expired policies and validity
   intervals over 24 hours. It rechecks allowed-agent readiness and exact agent/
   project configuration hashes before consent and again before submission.
   Top-level heartbeat/status timestamps and runtime observations are excluded; readiness
   is checked separately. Unknown configuration fields remain bound.
7. `npm run verify:platform -- --fingerprints` performs authorized reads and
   prints only configuration hashes/readiness, not returned configurations or
   keys. `npm run verify:platform` also checks the policy against current
   configuration. Both are read-only, keep execution switches unchanged and
   cannot verify coding or sandbox enforcement. Missing setup exits nonzero.
8. Keep `IMPROVEMENT_EXECUTOR_ENABLED=false` and
   `LIVE_DELEGATION_ENABLED=false` until the exact bounded live test is approved.
   Configure web and worker identically. Do not put secrets in chat or commits;
   use ignored local configuration or the approved server secret mechanism.

**An operator attestation is not an automatic sandbox audit.** Paperclip's public
documentation does not establish an installed per-task monetary ceiling. A
monthly budget or prompt text is insufficient. If the selected runtime cannot
enforce every declared control, especially the spend ceiling, leave the executor
disabled and the corresponding attestation false. Do not fill the example just
to remove a setup blocker. The application cannot provision or broaden these
controls. The capability gate must be established by an operator in a separately
authorized setup exercise before a coding run.

## Workspace lifecycle and limits

The selected Paperclip environment owns provisioning and preservation. Each
request uses exactly `codex/improve-<request UUID>`, a known base SHA and explicit
isolated workspace settings. Configure a disposable repository mirror/source
inside that environment; never the owner's active checkout. A worktree separates
files but is not a sandbox. The environment must enforce the process, network,
filesystem, credential, disk and log limits in the operator policy independently
of the model. No untrusted shell is executed by a web endpoint or the application
worker. Repository scripts and lifecycle hooks are executable untrusted code.

Default policy example: one task, at most 120 seconds, $1 enforced spend,
512 MB workspace, 12 KB output, explicit model/GitHub egress, no dependency
installation. These are proposed test limits, **not controls proven available**.
The schema permits at most 1,800 seconds, $10, 8 GB and 1 MB. Dependency behavior
is either disabled or explicitly operator-approved `ignore-scripts`; adding or
updating dependencies is outside ordinary tasks. CI has no application/model/
production secrets, read-only repository permission, nonpersistent checkout
credentials and a 20-minute timeout. It installs locked dependencies with
`npm ci --ignore-scripts`; the approved unchanged checks then execute in its
disposable runner.

Failed work is preserved by Paperclip. Control Center does not delete workspaces,
reset branches, force-push, resolve unrelated conflicts or clean evidence.
Workspace cleanup is manual in the execution platform: verify the resolved path
is below its managed root, inspect/preserve useful evidence, and enforce
retention there before deleting anything. No automatic cleanup was enabled.

## Consent and candidate integrity

States include discussing, investigating, awaiting authorization, queued,
implementing, validating, ready for review, changes requested, blocked, failed,
cancelled, integration authorized and integrated. Deployment is absent from the
execution API and is displayed separately as not started.

Investigation fetches at most eight selected source paths plus applicable nested
`AGENTS.md`, architecture and progress documents from a pinned Git tree. It
rejects traversal/symlink/submodule content and bounds source text to 32 KB. It
stores blob revisions and the base commit. Project/global knowledge is opt-in,
uses Phase 4 scope filtering and records retrieved revision/hash/citation
metadata. Only a bounded recent conversation and relevant execution state reach
the gateway. Sources, instructions, logs and model replies cannot grant tools,
permissions or authority; the gateway receives no tools.

The owner sees the problem, proposed behavior, exact paths, exclusions,
criteria, required checks, implications and external effects. UI changes always
require desktop/mobile verification. A readiness preview shows the exact runtime
limits before consent. Implementation authorization binds the plan revision,
base/source state, owner clarifications, selected knowledge and displayed policy
hash. The worker rechecks base and policy. Routine steps inside that scope do not
ask again. Post-authorization discussion cannot edit the active scope; it clears
review/integration consent and never schedules another coding task.

The GitHub adapter independently reads `codex/improve-<UUID>`, compares base to
exact candidate, checks ancestry/target compatibility, restricts changed/renamed
files to the approved scope, rejects symlinks/submodules and requires the
validation workflow blob to match the base. Binary/truncated diffs, large changes
or divergent/conflicting targets block review. Up to 20 commits/40 changed files
are accepted. It reads the actual push workflow run and job-step conclusions for
that exact SHA/branch/attempt. Successful step conclusion yields exit 0;
non-success numeric exit codes are not exposed by this API and remain unknown.
This is CI process evidence, not executor narration. Actual commands and CI links
are shown. No missing/failing checks can produce review-ready status.

The workflow uploads only synthetic browser captures with seven-day retention.
The evidence reader requires the nonexpired artifact for a UI candidate and
offers its exact run link in the review UI; absent captures block readiness.
For UI candidates open those artifacts and inspect both sizes; the owner must
assess whether they actually cover the changed behavior. Generic navigation or
passing axe alone does not prove acceptance. Add focused interaction coverage
within the approved test scope where needed. Test changes are visible in the
diff; the owner must reject weakened/replaced checks. No claim of automatic
semantic review or independent review is made.

Review is a separate, accurately labeled **owner self-review**: each acceptance
criterion, regressions/missing validation, security/secret exposure, scope,
migration and compatibility findings. The implementation model cannot submit
owner consent. Final integration authorization re-reads candidate/CI/target and
binds the commit, diff digest, validation digest and target SHA. A changed commit,
workflow attempt/evidence or target invalidates that approval. The UI can refresh
and re-review; it never approves a moving branch.

## Delivery and manual integration

This phase implements a manual handoff, not GitHub write credentials or automatic
merge. After review, the owner separately chooses **Leisti pateikti šį commit
integravimui**. The UI supplies the exact commit, target and GitHub comparison.
Create a PR manually, verify its HEAD is the approved SHA, use a sanitized
technical description and inspect CI. Never paste the private conversation,
policy or execution logs into a public PR. If the target moves, refresh/review
compatibility before integrating. Read-only synchronization marks integrated
only when Git ancestry proves that the approved candidate is on the target.
This does not deploy anything. Deployment approval belongs to Phase 6.

## Failure, cancellation and recovery

- JSON records use optimistic versions; mutations require owner identity, exact
  origin, bounded JSON and strict schemas. Jobs/records are committed together.
  Only one queued/running step is allowed per request.
- Before the first external POST the worker durably records the one-attempt
  boundary. A timeout/crash/unknown result is reconciled by stable marker, title,
  exact plan and assignee. Zero/multiple matches remain blocked. It never blindly
  repeats task creation, even on explicit Retry.
- Worker leases expire after five minutes. Interrupted model calls are not
  replayed. Submission recovery remains uncertain and read-only; late workers
  are fenced by lease/version checks. Restart tests close/reopen an on-disk DB.
- Safe read failures have a total three-attempt bound. A retry cannot create a
  paid repair loop. A failed candidate can receive feedback; create a new scoped
  request and new consent for another coding attempt. No unlimited agent resume.
- Source/credential/agent/configuration failures are explicit blockers. Existing
  tasks can still be reconciled with execution disabled. Unknown responses never
  fabricate success. Public output uses bounded redaction; this is common-pattern
  filtering, not comprehensive DLP, so never put secrets in the source/request.
- Cancel fences local work immediately and queues the documented Paperclip
  interrupt/cancel request. If creation is uncertain, reconcile first. The UI
  always distinguishes local stop, cancellation requested and **process stop not
  verified**. Task status alone is not proof of process termination. Manual
  external inspection is required if the request fails or is ambiguous.
- A worker time-limit guard requests cancellation after the declared runtime plus
  a 60-second observation grace. Hard limits must also be enforced by the runtime
  while the worker is offline. Cancellation is not rollback.
- Disable new execution with `IMPROVEMENT_EXECUTOR_ENABLED=false` (and, if desired,
  the broader `LIVE_DELEGATION_ENABLED=false`). Do not assume this stops running
  external work: use Cancel/Paperclip, preserve its workspace and verify stopping.

## Bounded issue suggestions

Only owner-selected enum signals (such as unavailable n8n or apparently stuck
work) enter this path. No raw logs, arbitrary URLs or traces are ingested. Signals
are grouped by owner/code/area; occurrences and last-seen are stored separately.
One signal group produces one discussion request, including after rejection.
Neither a signal nor a duplicate queues a model/coding job. No monitor, recurring
trigger, recursive repair or production editing is enabled.

A future monitor would need separate authorization for signal sources, polling
frequency, a per-day suggestion cap, retention/deletion, recursion suppression
and notification behavior. Leave it disabled until those controls are approved.

## Exact live example, pending separate approval

Owner request: **“Improve the empty state on the Knowledge page while preserving
its behavior.”** Use synthetic empty knowledge data and one disposable development
environment. Target only `src/components/knowledge.tsx` (plus a focused UI test
only if included in the reviewed plan). Clarify the existing “Pasirinkite
dokumentą arba sukurkite naują” text so the next action is clear; preserve all
search, import, document, memory and citation behavior. No dependencies,
migrations, credentials, policies, production or unrelated files.

Before a separate paid run, present the exact plan/base, ready agent/runtime,
provider and repository destinations, one-task limit, enforced 120-second/$1/
512-MB/12-KB limits (or explicitly reviewed replacements), network and dependency
behavior. Wait for owner approval. If those limits cannot be enforced, do not run.
Then demonstrate: persisted consent → real isolated code commit/push → unchanged
CI checks → desktop/mobile captures and focused behavior review → exact candidate
in this UI → separate manual integration consent or explicit rejection. Stop
before merge/deployment. A synthetic executor message or model-generated patch
does not satisfy this demonstration.

## Phase 6 prerequisites

First complete the separately approved real isolated coding example and validate
application PostgreSQL, the installed Paperclip workspace/cancellation contract,
runtime authentication, hard limits and CI provenance. Then prepare the Phase 6
deployment design: chosen target runtime/ARM64 verification, production IdP/proxy,
secret separation, resource quotas, backups/restore, artifact promotion, explicit
deployment consent tied to an exact reviewed revision, health verification and
rollback. Phase 5 grants no production credential or deployment authority.
