CREATE TABLE automation_catalog (
  owner_subject text PRIMARY KEY,
  config_hash text NOT NULL,
  workflows jsonb NOT NULL DEFAULT '[]',
  truncated boolean NOT NULL DEFAULT false,
  synced_at timestamptz,
  error_code text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE automation_requests (
  id uuid PRIMARY KEY,
  owner_subject text NOT NULL,
  request_id uuid NOT NULL UNIQUE,
  request_hash text NOT NULL,
  origin_hash text NOT NULL,
  conversation_id uuid REFERENCES conversations(id),
  turn_id uuid UNIQUE REFERENCES turns(id),
  state text NOT NULL CHECK(state IN ('awaiting_confirmation','submitting','accepted','running','waiting','succeeded','failed','cancelled','unknown')),
  contract jsonb NOT NULL,
  input jsonb NOT NULL,
  action_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  confirmed_by text,
  submission_started_at timestamptz,
  external_id text,
  external_status text,
  synced_at timestamptz,
  started_at timestamptz,
  stopped_at timestamptz,
  wait_till timestamptz,
  result jsonb,
  result_issue text,
  error_code text,
  tracking boolean NOT NULL DEFAULT true,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((confirmed_at IS NULL) = (confirmed_by IS NULL)),
  CHECK (external_id IS NULL OR confirmed_at IS NOT NULL),
  UNIQUE(origin_hash,external_id)
);
CREATE INDEX automation_owner_idx ON automation_requests(owner_subject,created_at DESC);
CREATE INDEX automation_recovery_idx ON automation_requests(tracking,updated_at);
