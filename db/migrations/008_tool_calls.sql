-- Tool Hub audit trail: which agent tool ran, how it ended, and any approval it created.
-- No tool arguments or results are stored.
CREATE TABLE tool_calls (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  tool text NOT NULL CHECK(length(tool) BETWEEN 1 AND 80),
  outcome text NOT NULL CHECK(outcome IN ('ok','error')),
  error_code text CHECK(error_code IS NULL OR length(error_code) BETWEEN 1 AND 64),
  duration_ms integer NOT NULL CHECK(duration_ms >= 0),
  approval_ref text CHECK(approval_ref IS NULL OR length(approval_ref) BETWEEN 1 AND 200)
);
CREATE INDEX tool_calls_created ON tool_calls(created_at);
