-- Learning layer: owner-reviewed lessons and per-message feedback.
-- Lessons are short rules; only 'approved' ones ever reach a model.
CREATE TABLE lessons (
  id uuid PRIMARY KEY,
  owner_subject text NOT NULL,
  scope text NOT NULL DEFAULT 'global' CHECK(length(scope) BETWEEN 1 AND 80),
  text text NOT NULL CHECK(length(text) BETWEEN 3 AND 400),
  text_key text NOT NULL,
  source text NOT NULL CHECK(source IN ('feedback','edit','rejection','failure','agent','owner')),
  state text NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','approved','rejected','retired')),
  occurrences integer NOT NULL DEFAULT 1 CHECK(occurrences >= 1),
  evidence text CHECK(evidence IS NULL OR length(evidence) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE(owner_subject, scope, text_key)
);
CREATE INDEX lessons_owner_state ON lessons(owner_subject, state, created_at DESC);
CREATE TABLE message_feedback (
  message_id uuid PRIMARY KEY REFERENCES messages(id),
  owner_subject text NOT NULL,
  rating smallint NOT NULL CHECK(rating IN (-1, 1)),
  note text CHECK(note IS NULL OR length(note) <= 400),
  created_at timestamptz NOT NULL DEFAULT now()
);
