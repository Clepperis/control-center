# PostgreSQL

Versioned SQL migrations are the schema source. Never write to Paperclip or n8n internal databases. The UI demo requires no database.

`001_foundation.sql` defines local projects and a derived knowledge search index. Future operational records must reference external task IDs rather than duplicate Paperclip's task lifecycle. The index is not a knowledge authority. Use `simple` text search initially and evaluate Lithuanian/English queries before adding semantic search.

Migrations require a separate application database and a controlled local migration step. Do not put database credentials on a command line or run migrations against remote services during development.
