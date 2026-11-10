ALTER TABLE projects ADD COLUMN owner_subject text;
CREATE INDEX projects_owner_idx ON projects(owner_subject,created_at);

CREATE TABLE knowledge_documents (
  id uuid PRIMARY KEY,
  owner_subject text NOT NULL,
  project_id uuid REFERENCES projects(id),
  title text NOT NULL,
  path text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK(content_type IN ('text/markdown','text/plain')),
  kind text NOT NULL CHECK(kind IN ('document','preference','decision','constraint')),
  provenance jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  content_hash text NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  superseded_by uuid REFERENCES knowledge_documents(id),
  index_status text NOT NULL DEFAULT 'pending' CHECK(index_status IN ('pending','indexed','stale','failed')),
  index_error text,
  indexed_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_scope_idx ON knowledge_documents(owner_subject,project_id,archived);
CREATE INDEX knowledge_work_idx ON knowledge_documents(index_status,checked_at);
CREATE TABLE knowledge_revisions (
  document_id uuid NOT NULL REFERENCES knowledge_documents(id),
  revision integer NOT NULL,
  content_hash text NOT NULL,
  path text NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(document_id,revision)
);
CREATE TABLE knowledge_chunks (
  document_id uuid NOT NULL REFERENCES knowledge_documents(id),
  revision integer NOT NULL,
  passage integer NOT NULL,
  content_hash text NOT NULL,
  heading text NOT NULL,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  start_line integer NOT NULL,
  end_line integer NOT NULL,
  content text NOT NULL,
  search_text tsvector NOT NULL,
  PRIMARY KEY(document_id,passage),
  FOREIGN KEY(document_id,revision) REFERENCES knowledge_revisions(document_id,revision)
);
CREATE INDEX knowledge_chunks_search_idx ON knowledge_chunks USING gin(search_text);
CREATE TABLE knowledge_imports (
  id uuid PRIMARY KEY,
  owner_subject text NOT NULL,
  project_id uuid REFERENCES projects(id),
  digest text NOT NULL,
  preview jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memory_proposals (
  id uuid PRIMARY KEY,
  owner_subject text NOT NULL,
  project_id uuid REFERENCES projects(id),
  kind text NOT NULL CHECK(kind IN ('preference','decision','constraint')),
  statement text NOT NULL,
  source jsonb NOT NULL,
  replaces uuid REFERENCES knowledge_documents(id),
  replaces_hash text,
  review_hash text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','rejected')),
  document_id uuid REFERENCES knowledge_documents(id),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX memory_review_idx ON memory_proposals(owner_subject,state,created_at);
ALTER TABLE turns ADD COLUMN knowledge_scope jsonb;
ALTER TABLE messages ADD COLUMN grounding jsonb;

-- knowledge_index from 001 was unused. Keep it for compatibility; Phase 4 uses
-- revision-bound chunks instead. Neither table is an authoritative document.
