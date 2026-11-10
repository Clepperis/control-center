CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  owner_subject text NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_owner_idx ON conversations(owner_subject, created_at DESC);
CREATE TABLE turns (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  request_id uuid NOT NULL UNIQUE,
  input_hash text NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','completed','failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX turns_recovery_idx ON turns(status,created_at);
CREATE UNIQUE INDEX turns_one_pending_per_conversation ON turns(conversation_id) WHERE status='pending';
CREATE TABLE messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  turn_id uuid NOT NULL REFERENCES turns(id),
  role text NOT NULL CHECK(role IN ('user','assistant')),
  content text NOT NULL,
  usage jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(turn_id,role)
);
CREATE INDEX messages_conversation_idx ON messages(conversation_id,created_at);
CREATE TABLE orchestration_runs (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  turn_id uuid NOT NULL UNIQUE REFERENCES turns(id),
  state text NOT NULL CHECK(state IN ('awaiting_confirmation','delegating','delegated','running','review','completed','failed','blocked','cancelled')),
  plan jsonb NOT NULL,
  plan_hash text NOT NULL,
  confirmed_at timestamptz,
  confirmed_by text,
  delegation_started_at timestamptz,
  external_task_id uuid UNIQUE,
  external_status text,
  synced_at timestamptz,
  result jsonb,
  error_code text,
  tracking boolean NOT NULL DEFAULT true,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((confirmed_at IS NULL) = (confirmed_by IS NULL)),
  CHECK (external_task_id IS NULL OR confirmed_at IS NOT NULL)
);
CREATE INDEX runs_reconcile_idx ON orchestration_runs(tracking,updated_at);
CREATE TABLE connection_checks (
  service text PRIMARY KEY,
  checked_at timestamptz,
  error_code text
);
