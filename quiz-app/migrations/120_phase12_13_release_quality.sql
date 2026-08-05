CREATE TABLE IF NOT EXISTS quiz_phase12_question_reports (
  id UUID PRIMARY KEY,
  profile_id UUID REFERENCES quiz_solo_profiles(id) ON DELETE SET NULL,
  question_id TEXT,
  question_text TEXT NOT NULL,
  quiz_type TEXT CHECK(quiz_type IN ('child','adult')),
  category TEXT,
  report_type TEXT NOT NULL CHECK(report_type IN ('wrong-answer','unclear','duplicate','outdated','typo','other')),
  comment TEXT,
  page_path TEXT,
  app_version TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved','dismissed')),
  resolution_note TEXT,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quiz_phase12_question_reports_status
  ON quiz_phase12_question_reports(status,created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_phase12_question_reports_question
  ON quiz_phase12_question_reports(question_id,created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_phase12_question_versions (
  id UUID PRIMARY KEY,
  question_id TEXT NOT NULL,
  quiz_type TEXT NOT NULL CHECK(quiz_type IN ('child','adult')),
  snapshot JSONB NOT NULL,
  change_type TEXT NOT NULL,
  actor TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quiz_phase12_question_versions_question
  ON quiz_phase12_question_versions(question_id,created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_phase12_feedback (
  id UUID PRIMARY KEY,
  profile_id UUID REFERENCES quiz_solo_profiles(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'bug' CHECK(kind IN ('bug','idea','usability','question','other')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  page_path TEXT,
  app_version TEXT,
  client_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved','dismissed')),
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quiz_phase12_feedback_status
  ON quiz_phase12_feedback(status,created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_phase12_error_events (
  id UUID PRIMARY KEY,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack_hash TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS quiz_phase12_error_events_unique_open
  ON quiz_phase12_error_events(source,stack_hash)
  WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS quiz_phase12_release_checks (
  id UUID PRIMARY KEY,
  version TEXT NOT NULL,
  commit_sha TEXT,
  status TEXT NOT NULL CHECK(status IN ('pass','warning','fail')),
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quiz_phase12_release_checks_time
  ON quiz_phase12_release_checks(created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_phase12_backup_checks (
  id UUID PRIMARY KEY,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pass','warning','fail')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quiz_phase12_backup_checks_time
  ON quiz_phase12_backup_checks(created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_phase12_legal_consents (
  profile_id UUID PRIMARY KEY REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  age_group TEXT CHECK(age_group IN ('16plus','under16')),
  guardian_email TEXT,
  guardian_verified_at TIMESTAMPTZ,
  privacy_version TEXT,
  terms_version TEXT,
  accepted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_phase12_guardian_tokens (
  token_hash TEXT PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  guardian_email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quiz_phase12_guardian_tokens_profile
  ON quiz_phase12_guardian_tokens(profile_id,created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_phase13_engagement (
  profile_id UUID PRIMARY KEY REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_day DATE,
  weekly_goal INTEGER NOT NULL DEFAULT 5 CHECK(weekly_goal BETWEEN 1 AND 50),
  reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_hour INTEGER NOT NULL DEFAULT 18 CHECK(reminder_hour BETWEEN 0 AND 23),
  recommendation_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_phase13_daily_activity (
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  activity_day DATE NOT NULL,
  games INTEGER NOT NULL DEFAULT 0,
  answers INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  activity_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(profile_id,activity_day)
);
CREATE INDEX IF NOT EXISTS quiz_phase13_daily_activity_day
  ON quiz_phase13_daily_activity(activity_day DESC);

CREATE TABLE IF NOT EXISTS quiz_phase13_achievements (
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(profile_id,achievement_id)
);

CREATE TABLE IF NOT EXISTS quiz_phase13_records (
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  record_key TEXT NOT NULL,
  record_value INTEGER NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(profile_id,record_key)
);
