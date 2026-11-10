-- Additive only. Existing owner subjects and approval records are untouched.
-- Better Auth 1.7 core schema; public registration is disabled in the app.
CREATE TABLE auth_user (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 3 AND 200 AND id <> 'development-owner'),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_account (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL CHECK ("providerId" = 'credential'),
  "userId" text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz,
  scope text, password text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("userId", "providerId")
);
CREATE TABLE auth_session (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text, "userAgent" text,
  "userId" text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
);
CREATE INDEX auth_session_user_idx ON auth_session("userId");
CREATE TABLE auth_verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_verification_identifier_idx ON auth_verification(identifier);
-- One global login budget for the single account: independent of claimed IP,
-- submitted email, web process, and restart. Atomic upsert under contention.
CREATE TABLE auth_login_budget (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 11)
);
CREATE TABLE worker_heartbeat (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  completed_at timestamptz NOT NULL,
  release text NOT NULL
);
