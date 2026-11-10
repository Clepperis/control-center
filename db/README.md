# PostgreSQL

`002_orchestration.sql` adds owner conversations, idempotent turns, messages, immutable proposals/confirmation records, external references, leases and connection checks. Credentials are not stored here. Set `DATABASE_URL` privately and run `npm run db:migrate`; the runner uses an advisory transaction lock and checksums and applies pending files atomically. Do not edit applied migrations.

Use separate migration/runtime database roles in production. Tests run these migrations in PGlite, including on-disk reopening. A conventional PostgreSQL server still needs live setup verification.

`003_automations.sql` adds owner-scoped n8n catalog snapshots and immutable execution requests, exact confirmation digests/expiry, external execution links, bounded results and reconciliation leases. It stores application projections only; n8n owns the actual execution lifecycle and retention. Unknown submissions are recovered by reads, never replayed. Credentials remain in server configuration, outside these tables.

Versioned SQL migrations are the schema source. Never write to Paperclip or n8n internal databases. The UI demo requires no database.

`004_knowledge.sql` adds owner scope to projects; registered Markdown documents,
immutable revision metadata, derived chunks with exact passage offsets/FTS,
bounded import previews, reviewed memory proposals and chat grounding manifests.
The old unused `knowledge_index` remains for compatibility; current retrieval
uses `knowledge_chunks`. Run `npm run knowledge:index -- --rebuild` for a finite
rebuild of registered documents, or queue it in the UI and run the worker.
Private Markdown/history and operational PostgreSQL need separate backups.

`001_foundation.sql` defines local projects and a derived knowledge search index. Future operational records must reference external task IDs rather than duplicate Paperclip's task lifecycle. The index is not a knowledge authority. Use `simple` text search initially and evaluate Lithuanian/English queries before adding semantic search.

Migrations require a separate application database and a controlled local migration step. Do not put database credentials on a command line or run migrations against remote services during development.
