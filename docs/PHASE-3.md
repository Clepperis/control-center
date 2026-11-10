# Phase 3: confirmed n8n automation

## Scope and evidence

Reviewed 2026-11-10. One curated path uses n8n's official instance-level MCP over Streamable HTTP. It covers discovery, definition checks, manual execution and execution reads; no REST execution route is assumed. The application uses its own server-side MCP bearer token through the official TypeScript client. Codex OAuth is never read or reused.

The connected development MCP successfully listed workflows and executions. An independently validated, dedicated two-node text-transform draft was created and read back: unpublished, inactive, MCP-visible, no credentials or schedules. Nothing was executed or published. Instance identity and draft identifiers stay in the ignored local handoff, not this public document.

| Capability                 | Status and evidence                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery/details          | **Verified through development MCP:** search and complete draft read succeeded. Application-key access remains **unverified**.                                                    |
| Installed version          | **Unverified now.** The private audit previously recorded 2.46.6; it is not treated as a fresh version check. Automatic safety review rejected opening the instance in a browser. |
| Application authentication | **Documented, unverified with application credentials:** a separate MCP personal access token in `Authorization: Bearer`, not `X-N8N-API-KEY`.                                    |
| Submission/input           | **Verified advertised contract:** `execute_workflow`, explicit `manual`, fixed trigger name, webhook body. Actual execution is **unverified**.                                    |
| Draft versus production    | **Documented:** manual uses the current draft; production uses a published version. This application implements only the reviewed draft/manual path.                              |
| Execution ID/status        | **Verified advertised contract:** immediate ID followed by workflow-scoped status reads. The empty execution search succeeded; live transitions remain **unverified**.            |
| Results/retention          | Selected-node data shape checked against official source; deterministic tests pass. Installed retention, redaction and result availability are **unverified**.                    |
| Cancellation/retry         | **Unsupported in Control Center.** Use native n8n. A new request requires another confirmation; stopping tracking does not cancel external work.                                  |
| Limits/errors              | Actual account rate limits are **unverified**. HTTP auth/rate-limit/provider errors are mapped; timeouts and response sizes are bounded.                                          |

Primary contracts: [instance-level MCP and authentication](https://docs.n8n.io/connect/connect-to-n8n-mcp-server/), [tool reference](https://docs.n8n.io/connect/connect-to-n8n-mcp-server/mcp-server-tools-reference/), [bearer/endpoint examples](https://docs.n8n.io/connect/connect-to-n8n-mcp-server/mcp-client-examples.md), [execution data implementation](https://github.com/n8n-io/n8n/blob/master/packages/cli/src/modules/mcp/tools/get-execution.tool.ts), [native execution links](https://github.com/n8n-io/n8n/blob/master/packages/cli/src/execution-lifecycle/execute-error-workflow.ts).

## Configure and review locally

1. Keep an existing `.env.local`; add the placeholders from `.env.example`. Set `DATA_MODE=live` and a separate application `DATABASE_URL`, then run `npm run db:migrate`. Migration `003_automations.sql` adds owner-scoped catalog/request records, unique request/execution identifiers, approval timestamps and reconciliation leases.
2. The owner obtains a separate application MCP token in n8n **Settings → Instance-level MCP → Connect → API key**. The first visit may generate the personal token. This is an explicit owner action; do not copy Codex tokens or put credentials in chat. The token inherits native user permissions; the application's curated list does not restrict a stolen token's native authority.
3. Set `N8N_ORIGIN` to the HTTPS origin, `N8N_MCP_TOKEN` to that token, and pin the reviewed draft's `N8N_TEXT_WORKFLOW_ID` and `N8N_TEXT_WORKFLOW_VERSION`. The example SDK source is [safe-text.workflow.mjs](../examples/n8n/safe-text.workflow.mjs). It is an n8n builder input, not application runtime code. Do not publish it or register a production webhook for this path.
4. Leave `N8N_EXECUTION_ENABLED=false`. Run `npm run verify:n8n` for a redacted read-only check, then `npm run dev` and `npm run worker` in separate terminals. Open Automations and select **Patikrinti ryšį ir katalogą**. The catalog check proves an authorized read, not successful execution. Native presence, publication, MCP visibility, contract eligibility and the execution switch remain separate.
5. Only after the owner approves the exact live test, enable execution locally. Enter the synthetic text and prepare its review; this creates a local proposal without executing n8n. Review input/effects/version, then confirm. The UI follows actual status; the worker continues reconciliation across browser/application restarts. Turn the switch off after the bounded test if no further executions are authorized.

No remote database is needed for demo inspection. Operational mode requires a PostgreSQL server; test-only PGlite is not a runtime fallback. Missing credentials/storage fail explicitly, without synthetic successes.

## Contract and confirmation

Only `safe-text-v1` is supported. Its strict input is `{ text: string }`, trimmed, 1–240 characters, with unsupported fields rejected. It uses exactly a POST Webhook trigger named `Synthetic input` and an Edit Fields node named `Transform text`. The result is a small uppercase string with the local request's correlation ID. No conversation history or credentials are inputs. n8n may retain its own execution history; there are no explicit database/file/network/message/model nodes.

The server checks the pinned version, exact graph, node versions/parameters, credential absence, execution permission, MCP visibility and unpublished/inactive state. A name or description grants nothing. Existing business workflows remain read-only.

An immutable canonical digest binds the local request ID, contract, input and origin to a 30-minute review. Editing creates a new proposal; a separate identical request has a different digest. Confirmation checks owner, digest, expiry, current contract and switch before atomically claiming one attempt. Chat proposals use the same service and database transaction as the saved assistant response; no Paperclip task wraps an n8n execution. External results remain untrusted data and never enter the model as instructions.

MCP manual execution does not accept an atomic version pin. A privileged concurrent native edit between verification and execution cannot be ruled out by this API. Avoid editing the curated draft during a reviewed action; publication or any detected version/graph change blocks the path. This is a bounded test integration, not a guarantee against a compromised n8n administrator.

## Submission, recovery and observation

- Unique local request IDs and an atomic confirmation claim prevent duplicate clicks/replays from creating another attempt. Submissions have no retries, including transport reconnection replay. Exactly-once external execution is not promised.
- A returned execution ID is persisted. A timeout, malformed acknowledgement or interrupted submission becomes **submission outcome unknown**. Recovery never calls the execute tool.
- Unknown outcomes search at most five candidate executions after the attempt. Only one complete search with exact trigger-body request ID, input, workflow and manual mode may establish the link. Missing/redacted/pruned data, partial results or zero/multiple matches stay unresolved. Check native n8n before deliberately creating another request.
- `new` maps to accepted, `running` to running, `waiting` to waiting, `success` to succeeded, `error`/`crashed` to failed, `canceled` to cancelled, and unknown values to unknown. Read failures retain the last observed state and timestamp. A successful status remains success even if its result is unavailable or malformed.
- Reads have at most two attempts, a short bounded delay, default 8-second total call time (configurable 1–15 seconds), and a 1MB response ceiling. Results request only the two known nodes and one item, and persist only validated bounded output. Provider bodies, secrets and endpoints are excluded from logs.
- The existing worker checks at most three automation requests per tick, with database leases and fair rotation. Submission claims older than 90 seconds become uncertain. Automatic tracking stops after 24 hours; manual checks remain available. Browser polling is limited to eight checks per mounted run, pausing in hidden tabs.
- Local tracking stop preserves the external execution. Origin changes cannot redirect old execution lookups or links to a new server. A subsequent side-effecting attempt always needs a new reviewed request.

Workflow editing, publishing, schedules, credentials, detailed traces, retention, external cancellation and native retries remain in n8n. Control Center adds no business scheduler, workflow editor or execution engine.

## Validation and live gate

Automated tests use the real adapter/MCP client with test-only HTTP responses and the real migrations against a PostgreSQL engine. They cover input/configuration, permissions, exact/expired confirmation, concurrent clicks, ambiguous submission, actual engine close/reopen, status mapping, malformed/large results, owner isolation, chat and local tracking stop. Browser checks include desktop/mobile accessibility and the existing Paperclip path. Test substitutes are never selectable production adapters.

**Live execution is not verified.** The local workspace currently lacks an application PostgreSQL URL, n8n origin/token and workflow/version configuration. Exact installed-version verification is also outstanding. A draft's creation and validation are not execution evidence. No schedules, business workflows, models or production deployment were run.

The exact next action is secure local setup and a successful read-only `verify:n8n`, followed by explicit approval for the dedicated draft with input `labas pasauli`. Expected output: `LABAS PASAULI`. Persistent effects: one local approval/request record and native n8n execution history; no publication or other external effects. Verify returned execution ID, native success and bounded result, repeated-confirmation deduplication, and recovery after restart. If approval/configuration is absent, keep execution disabled.

Next phase: approved Markdown knowledge and project memory, with source provenance, project-scoped retrieval, explicit write review and rebuildable PostgreSQL search. It must not treat workflow output as authoritative memory automatically.
