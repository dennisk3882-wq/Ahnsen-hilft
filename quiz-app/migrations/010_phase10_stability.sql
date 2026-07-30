CREATE TABLE IF NOT EXISTS quiz_phase10_result_ledger (
  result_key TEXT NOT NULL,
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(result_key, profile_id, entry_type)
);

CREATE INDEX IF NOT EXISTS quiz_phase10_result_ledger_created
  ON quiz_phase10_result_ledger(created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_phase10_reward_ledger (
  reward_key TEXT NOT NULL,
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  reward_type TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  season_points INTEGER NOT NULL DEFAULT 0,
  badge_id TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(reward_key, profile_id, reward_type)
);

CREATE INDEX IF NOT EXISTS quiz_phase10_reward_ledger_profile
  ON quiz_phase10_reward_ledger(profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_phase10_profile_leagues (
  profile_id UUID PRIMARY KEY REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  season_id UUID REFERENCES quiz_platform_seasons(id) ON DELETE SET NULL,
  league_id TEXT NOT NULL DEFAULT 'bronze' CHECK(league_id IN ('bronze','silver','gold','master')),
  previous_league_id TEXT CHECK(previous_league_id IS NULL OR previous_league_id IN ('bronze','silver','gold','master')),
  last_outcome TEXT NOT NULL DEFAULT 'new' CHECK(last_outcome IN ('new','promotion','relegation','stay')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quiz_phase10_profile_leagues_season
  ON quiz_phase10_profile_leagues(season_id, league_id);

ALTER TABLE quiz_phase10_event_sessions
  ADD COLUMN IF NOT EXISTS attempt_no INTEGER,
  ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_recorded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS quiz_phase10_event_sessions_profile_event
  ON quiz_phase10_event_sessions(profile_id, event_id, started_at DESC);

ALTER TABLE quiz_phase10_tournament_matches
  ADD COLUMN IF NOT EXISTS tiebreak_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_tie_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS quiz_phase10_manual_adjustments (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  xp_delta INTEGER NOT NULL DEFAULT 0,
  season_points_delta INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  admin_actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_phase10_repair_log (
  id UUID PRIMARY KEY,
  repair_type TEXT NOT NULL,
  target_key TEXT,
  result TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quiz_phase10_repair_log_created
  ON quiz_phase10_repair_log(created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_external_history_imports (
  import_key TEXT PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('offline','live')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quiz_external_history_imports_profile
  ON quiz_external_history_imports(profile_id, imported_at DESC);
