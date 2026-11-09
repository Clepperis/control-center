CREATE TABLE projects (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Rebuildable projection only. Markdown files remain authoritative.
CREATE TABLE knowledge_index (
  document_path text PRIMARY KEY,
  project_id uuid REFERENCES projects(id),
  source_hash text NOT NULL,
  title text NOT NULL,
  search_text tsvector NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_search_idx ON knowledge_index USING gin(search_text);
