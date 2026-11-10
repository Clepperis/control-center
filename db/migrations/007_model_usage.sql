-- Installation-level model call accounting. No prompts, replies or credentials.
CREATE TABLE model_usage (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK(source IN ('chat','knowledge','improvement')),
  model text NOT NULL CHECK(length(model) BETWEEN 1 AND 200),
  outcome text NOT NULL CHECK(outcome IN ('ok','error')),
  error_code text CHECK(error_code IS NULL OR length(error_code) BETWEEN 1 AND 64),
  input_tokens integer CHECK(input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK(output_tokens IS NULL OR output_tokens >= 0),
  total_tokens integer CHECK(total_tokens IS NULL OR total_tokens >= 0),
  credits numeric CHECK(credits IS NULL OR credits >= 0),
  duration_ms integer NOT NULL CHECK(duration_ms >= 0),
  CHECK((outcome = 'ok') = (error_code IS NULL))
);
CREATE INDEX model_usage_created ON model_usage(created_at);
