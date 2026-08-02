CREATE TABLE IF NOT EXISTS quiz_phase11_onboarding (
  profile_id UUID PRIMARY KEY REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  reward_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO quiz_phase11_onboarding(profile_id)
SELECT id FROM quiz_solo_profiles
ON CONFLICT(profile_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS quiz_phase11_answer_events (
  id UUID PRIMARY KEY,
  client_event_id TEXT,
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  question_key TEXT NOT NULL,
  answer_index INTEGER,
  response_ms INTEGER,
  accepted BOOLEAN NOT NULL DEFAULT FALSE,
  status_code INTEGER,
  risk_score INTEGER NOT NULL DEFAULT 0,
  risk_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  ip_hash TEXT,
  user_agent_hash TEXT,
  browser_family TEXT,
  device_family TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS quiz_phase11_answer_client_event_unique
  ON quiz_phase11_answer_events(client_event_id)
  WHERE client_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quiz_phase11_answer_profile_time
  ON quiz_phase11_answer_events(profile_id,created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_phase11_answer_source
  ON quiz_phase11_answer_events(source_type,source_id,profile_id,created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_phase11_answer_device_time
  ON quiz_phase11_answer_events(browser_family,device_family,created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_phase11_risk_flags (
  id UUID PRIMARY KEY,
  profile_id UUID REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved','dismissed')),
  flag_type TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  source_type TEXT,
  source_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  reviewed_by TEXT
);

CREATE INDEX IF NOT EXISTS quiz_phase11_risk_flags_status
  ON quiz_phase11_risk_flags(status,severity,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS quiz_phase11_risk_flags_profile
  ON quiz_phase11_risk_flags(profile_id,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS quiz_phase11_player_sanctions (
  profile_id UUID PRIMARY KEY REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  ranking_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  competition_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS quiz_phase11_player_notices (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  notice_type TEXT NOT NULL DEFAULT 'warning' CHECK(notice_type IN ('info','warning','sanction')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS quiz_phase11_player_notices_profile
  ON quiz_phase11_player_notices(profile_id,created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_phase11_question_controls (
  question_id TEXT PRIMARY KEY,
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS quiz_phase11_production_checks (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('pass','warning','fail')),
  version TEXT NOT NULL,
  commit_sha TEXT,
  base_url TEXT,
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quiz_phase11_production_checks_time
  ON quiz_phase11_production_checks(created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_phase11_daily_snapshots (
  snapshot_day DATE PRIMARY KEY,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
