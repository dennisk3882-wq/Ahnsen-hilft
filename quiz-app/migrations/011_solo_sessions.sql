CREATE TABLE IF NOT EXISTS quiz_solo_sessions (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '2 hours',
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS quiz_solo_sessions_profile_updated
  ON quiz_solo_sessions(profile_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS quiz_solo_sessions_expires
  ON quiz_solo_sessions(expires_at);
