# Phase 4: private project knowledge and reviewed memory

Implemented locally on the completed Phase 3 branch. No production deployment,
private imports, paid indexing, model completions or workflow/agent executions
are part of this delivery. Synthetic model substitutes test application behavior,
not grounded answer quality.

## Configure and review

Keep the existing ignored `.env.local`. Use a separate **local application**
PostgreSQL database, `DATA_MODE=live`, and an absolute `KNOWLEDGE_ROOT` outside
this public checkout. For a future Linux host, a suitable persistent volume is
`/var/lib/control-center/knowledge`, readable/writable only by the application
owner. On Windows select a separate private directory, not a parent of this repo.
The application rejects checkout descendants, ancestors, filesystem roots,
symlinks and junctions. Do not point it at an existing private vault to try the UI.

```powershell
npm run db:migrate
npm run dev
# Separate terminal, same environment and persistent filesystem:
npm run worker
```

Open **Žinios**, create a fictional project, create Markdown, refresh after the
worker tick, and search. **Projektai ir užduotys** links to each project's
knowledge without replacing the Paperclip work feed. In chat, choose **Naudoti
projekto žinias**, select the project and explicitly allow global knowledge if
needed. Knowledge storage and search require no provider credentials. Chat still
requires the separately configured/approved nexos gateway from Phase 2.

The synthetic browser suite needs no `.env.local` secrets or PostgreSQL server:
`npm run test:ui:live` starts its own isolated loopback server and test database.
It uses a separate `.local/next-synthetic` build directory so the owner's normal
development server may stay running.

## Authority, layout and revisions

Markdown remains authoritative. PostgreSQL stores the owner/project registry,
current path/hash/revision, provenance, timestamps, index status, proposal and
approval records, passage locators and chat evidence manifests.

```text
KNOWLEDGE_ROOT/
  documents/<stable UUID>/<title-slug>.md
  history/<stable UUID>/<revision>-<SHA-256>.md
  conflicts/<recovery UUID>.md
```

Every file starts with ordinary Markdown frontmatter containing one `cc:` JSON
record. It includes stable ID, explicit project/null-global scope, title, MIME
type, document/memory kind, provenance, archive and supersession state. Do not
manually change identity, scope, provenance or approval/lifecycle fields. Source
creation times are not invented: database timestamps describe ingestion or
observed updates, not an imported file's original creation.

The UI/service is the authoritative write path. Writes lock the metadata row,
check the exact raw-file hash, write and fsync a temporary file, move the actual
previous file to a recovery location, verify it, then publish by an exclusive
same-filesystem hard link. Publication never clobbers a concurrently created
file. This requires hard-link support (tested on local Windows NTFS); unsupported
filesystems fail closed. There may be a brief absent destination during update.
All complete revisions have immutable snapshots and verified hashes. Renaming
changes the path and revision while keeping the document UUID and old citations.

An external editor racing the update leaves both versions available in
`conflicts/`; the UI preserves its unsaved draft for export. Reopen deliberately
to compare, copy the desired text into a fresh revision, or export the recovery
copy from document history. Archives are reversible. Superseded memories cannot
be restored into authority without a fresh reviewed proposal.

The filesystem and PostgreSQL do not share a distributed transaction. A crash
after a file write but before DB commit is reconciled for registered ordinary
documents on the next pass. An unregistered newly written directory is retained
for explicit operator inspection/import, never silently adopted as approved
memory. A failed multi-file import may likewise leave unregistered recovery
files; inspect the preview's stable IDs before resubmitting. Back up **both** the
private directory (including history/conflicts) and operational PostgreSQL, and
test restoration. Git is neither the backup nor the conflict resolver.

The private volume must be writable only by trusted owner/editor processes.
Path component checks, realpath boundaries, no-follow opens and hard-link checks
reject ordinary traversal and symlink/junction escapes. Portable Node path APIs
do not isolate a hostile local process that can concurrently replace ancestors;
OS permissions and the separate volume provide that boundary.

## Import and optional Obsidian editing

Browser file/folder pickers are the only import sources. No home directory,
drive, server path, cloud drive or vault discovery is performed. The preview
fixes the selected scope, exact supported content, exclusions, counts, bytes and
duplicate policy. Limits: 20 selected files, 24,000 UTF-8 bytes per supported
file, 240,000 bytes of content total. The bounded JSON endpoint allows 600 KB of
encoding overhead. UTF-8 `.md` and `.txt` only; hidden path segments, traversal,
configuration directories and other extensions are excluded. Excluded browser
file contents are not read. Raw selected content stays local until confirmation;
the application stores an expiring local preview, never sends it to a model.

Identical imported content in the same project is skipped using its import
fingerprint; repeated/concurrent preview confirmations are serialized and do not
duplicate documents. The fingerprint identifies the original imported source,
even if its managed copy was subsequently edited. Same filename/different
content is a separate UUID, explicitly shown as a new copy; it never overwrites.
Preview approval expires after 30 minutes. No scripts, links or embedded code run.

Obsidian can open the ordinary private Markdown folder on the host with access
to that filesystem. UI export supports body-only and metadata-bearing Markdown.
This is not desktop/server sync: no plugins, Sync purchase or bidirectional
service is installed. External body/title changes and a single-file rename
within its stable UUID directory are detected without restart. New external
files require explicit import; moving files across UUID directories is unsupported.
Reviewed memory edited externally is quarantined, not silently reapproved.

## Indexing, retrieval and recovery

The existing worker checks at most ten registered documents per tick, oldest
check first. Work is durable in PostgreSQL's document status; row locks serialize
workers and UI writes. `pending`, `indexed`, `stale`, and `failed` are distinct.
Only changed content produces another revision/chunk generation. Archived and
superseded documents lose their chunks. Missing/unreadable/malformed files fail
explicitly and are excluded. UI retry prioritizes a document; refresh reports the
actual state and does not secretly run indexing inside a request.

Headings and paragraph boundaries define passages, capped at 1,800 UTF-16 units
(long single lines use a hard split). Each stores heading, exact body offsets,
line locator, revision and raw-file hash. Replacement of chunks and successful
status happen together in one DB transaction. A failed generation never makes
old chunks look current. Before returning search evidence the service rechecks
candidate files and suppresses changed/missing documents immediately, even if
the worker has not observed the edit yet. An edit _after_ retrieval remains a
valid historical citation to the retrieved immutable revision.

```powershell
# Finite bounded pass; no provider calls:
npm run knowledge:index
# Mark all registered documents pending and rebuild in finite batches:
npm run knowledge:index -- --rebuild
```

The UI can queue the same rebuild. Search is unavailable for pending generations
until the worker completes them. A failed pass returns a failing exit code and
only redacted counts/statuses. Unknown new filesystem files are not auto-imported.

### Verified lexical baseline

PostgreSQL `simple` FTS, GIN, weighted title/heading matching and `ts_rank_cd`
provide the baseline. The application normalizes Unicode accents and case for
index/query, removes a small LT/EN stop-word set, and uses a small explicitly
limited Lithuanian suffix-to-prefix query fallback. It does **not** claim a
Lithuanian language analyzer. Query lexemes are escaped/parameterized and capped
at 12. One- and two-term queries require every term; longer queries require two
thirds of their terms, and passages matching more terms rank first. Filtering by
authenticated owner and selected project
or explicit global permission occurs in SQL before any model receives content.
At most two passages per document enter a 16-candidate set; at most six passages
reach the model. Search snippets are original plain text, not HTML from the DB.

The PostgreSQL-engine tests inspect `pg_ts_config` and optional extension
availability. `simple` is verified; no Lithuanian configuration or pgvector is
assumed. The production database is not configured here. The fictional Atlas/
Harbor fixture gives **8/8 hits** for the selected positive lexical queries:
`Aušros`, `Silver Otter`, `ATLAS-42`, `archyvavimo`, `archyvavimas`, `Markdown`,
`offline export`, `dokumentuose`. Harbor's `Copper Finch` returns zero in Atlas;
global Lithuanian preference text is absent unless global scope is explicitly
included. `keep notes without the internet` returns zero despite a related
offline-export paragraph: **paraphrase retrieval is a demonstrated limitation**.
This tiny fixture is a regression baseline, not a general retrieval benchmark.
The question `What is the Atlas release codename for the archive?` (three of four
terms present) finds the Silver Otter passage, while `Copper Finch release
codename` (two of four) still returns nothing in Atlas. Partial matching can
still miss questions that share too few words with the source; prefixes may
overmatch.

No semantic toggle, embeddings client or vector schema exists. No nexos
embeddings contract is assumed. Adding semantics requires owner approval of
source/destination and a current official provider contract/cost/data-handling
review, plus demonstrated improvement on an expanded synthetic evaluation set.

Primary references: [PostgreSQL query/ranking controls](https://www.postgresql.org/docs/current/textsearch-controls.html),
[simple dictionaries](https://www.postgresql.org/docs/current/textsearch-dictionaries.html),
[Node filesystem operations](https://nodejs.org/docs/latest-v24.x/api/fs.html).
Next 16.4.6's installed App Router, server/client and route-handler guides were
read before implementation. No new runtime library/framework was introduced.
Runtime private-volume paths opt out of Turbopack asset tracing. Standalone
traces explicitly exclude environment files, local audits, private directories
and test data; `npm run test:boundary` checks the resulting artifact boundary.

## Grounded chat and citation behavior

The existing orchestrator/gateway handles knowledge questions. The active scope
is saved on the turn and participates in idempotency. Knowledge turns send only
the current question plus bounded evidence, excluding other-project conversation
history. Ordinary chat excludes earlier knowledge-scoped messages from model
history. Empty or disconnected retrieval stays explicitly labeled as lacking
project grounding. It does not disable ordinary conversation.

Reference data is JSON-encoded in a separate user-role context message, never
system instructions. Knowledge turns offer no Paperclip agents or n8n contracts,
and the server rejects tool/delegation reply kinds even if a malicious document
convinces the model to emit one. Ordinary delegation/automation still uses all
previous confirmation gates. Documents cannot approve actions.

The model uses labels `[S1]`–`[S6]`. The server neutralizes unknown labels and
records retrieved UUID/revision/hash/passage/offsets beside the answer. Citation
URLs are generated by application code from that saved manifest; model paths,
URLs and IDs are never citation authority. Clicking verifies ownership, label,
immutable revision hash and exact passage text. It opens that historical passage
and full source, showing a warning if the current document changed. Missing or
damaged original history returns **410**, never substituted current text. An
answer without citations is explicitly marked unverified even if evidence was
supplied. Real factual support/contradiction handling still requires model review;
the application validates provenance, not semantic truth.

Markdown uses a conservative React-rendered subset (headings, lists, paragraphs,
bold, inline/fenced code and explicit HTTP(S)/mailto links). HTML is escaped,
unsafe URLs are inert, image syntax stays text, and rendering does not fetch
remote assets or execute code. Full CommonMark/MDX is deliberately unsupported.

## Memory rules

Only exact concise preferences, project decisions or reusable facts/constraints
may be proposed. A model suggestion or owner-selected source creates a **pending**
PostgreSQL record; it is never indexed/authoritative before confirmation. The
server fixes scope/source; a project message cannot infer a global preference.
The review shows the exact statement, project/global destination, immutable
source revision or conversation message, and current same-kind scoped memories.
These peers are conservatively shown as possible conflicts, not AI-classified.

Approval binds the statement, scope, source, replacement and current peer hashes.
Changed files/peers invalidate the review. Other peers require explicit owner
acknowledgement to retain both statements. Replacement is explicit: the previous
Markdown is archived with a successor link, and its entire revision history
remains available. No newest-wins policy exists. Editing accepted memory creates
a reviewed superseding proposal. Removal uses recoverable archive. Exact duplicate
statements and common secret patterns are rejected; this is not comprehensive
DLP. The owner must never propose secrets. Full transcripts, hidden reasoning,
workflow outputs and agent logs are not ingested automatically.

## Remaining verification and next phase

Tests use the actual migrations in PGlite and synthetic local filesystem data.
HTTP-handler tests exercise real request validation with an explicitly substituted
owner session/database factory. Browser tests substitute transport and the model,
while exercising the real knowledge services, index, approval flow and UI.
Conventional PostgreSQL-server, ARM64, hard-link behavior on the eventual volume,
backup/restore and production IdP/proxy verification remain deployment work.

No real model answer-quality test was performed. A future bounded test requires
the selected local synthetic Atlas source, configured exact nexos model/key,
explicit approval of transmission to nexos/upstream, and approval for one
completion capped at 1,200 output tokens. Proposed question: `Koks ATLAS-42
eksporto formatas?` Verify relevant retrieval, supported claims, citations and a
second check after editing the source. Token limits are not a monetary ceiling;
do not enable paid calls before the owner approves the exact test.

Next is the dedicated **Improve System** agent: one bounded development task,
isolated execution environment/checkout, tests, reviewable diff and explicit
production approval. Paperclip retains delegated tasks; n8n retains workflow
execution; Control Center retains knowledge, scope, retrieval and memory review.
