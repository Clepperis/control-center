-- Private operational records. Never export conversations/evidence to a public PR.
CREATE TABLE improvement_requests (
  id uuid PRIMARY KEY,
  owner_subject text NOT NULL,
  request_key uuid NOT NULL,
  input_hash text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_subject, request_key)
);
CREATE TABLE improvement_jobs (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES improvement_requests(id),
  kind text NOT NULL CHECK(kind IN ('discuss','investigate','submit','sync','evidence','cancel')),
  state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  lease uuid,
  leased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX improvement_one_job ON improvement_jobs(request_id) WHERE state IN ('queued','running');
CREATE INDEX improvement_jobs_queue ON improvement_jobs(state,created_at);
CREATE TABLE improvement_signals (
  owner_subject text NOT NULL,
  fingerprint text NOT NULL,
  request_id uuid NOT NULL REFERENCES improvement_requests(id),
  occurrences integer NOT NULL DEFAULT 1,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_subject,fingerprint)
);
