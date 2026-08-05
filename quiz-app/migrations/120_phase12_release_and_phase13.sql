CREATE TABLE IF NOT EXISTS quiz_question_reports (
  id UUID PRIMARY KEY,
  profile_id UUID REFERENCES quiz_solo_profiles(id) ON DELETE SET NULL,
  question_id TEXT NOT NULL,
  quiz_type TEXT NOT NULL CHECK(quiz_type IN ('child','adult')),
  category TEXT,
  reason TEXT NOT NULL CHECK(reason IN ('wrong_answer','unclear','typo','outdated','duplicate','other')),
  details TEXT,
  page TEXT,
  app_version TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved','dismissed')),
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);
CREATE INDEX IF NOT EXISTS quiz_question_reports_status_time ON quiz_question_reports(status,created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_question_reports_question ON quiz_question_reports(question_id,status);

CREATE TABLE IF NOT EXISTS quiz_question_revisions (
  id UUID PRIMARY KEY,
  question_id TEXT NOT NULL,
  quiz_type TEXT NOT NULL CHECK(quiz_type IN ('child','adult')),
  before_data JSONB,
  after_data JSONB NOT NULL,
  reason TEXT NOT NULL,
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quiz_question_revisions_question ON quiz_question_revisions(question_id,created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_beta_feedback (
  id UUID PRIMARY KEY,
  profile_id UUID REFERENCES quiz_solo_profiles(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'problem' CHECK(kind IN ('problem','idea','question_feedback','praise')),
  message TEXT NOT NULL,
  page TEXT,
  app_version TEXT,
  browser TEXT,
  device TEXT,
  viewport TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved','dismissed')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS quiz_beta_feedback_status ON quiz_beta_feedback(status,created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_release_checks (
  id UUID PRIMARY KEY,
  version TEXT NOT NULL,
  commit_sha TEXT,
  environment TEXT NOT NULL DEFAULT 'production',
  status TEXT NOT NULL CHECK(status IN ('pass','warning','fail')),
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quiz_release_checks_time ON quiz_release_checks(created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_data_requests (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK(request_type IN ('export','delete')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','processing','completed','cancelled','failed')),
  confirmation_token_hash TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  note TEXT
);
CREATE INDEX IF NOT EXISTS quiz_data_requests_profile ON quiz_data_requests(profile_id,requested_at DESC);

CREATE TABLE IF NOT EXISTS quiz_retention_profiles (
  profile_id UUID PRIMARY KEY REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_active_day DATE,
  reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_hour INTEGER NOT NULL DEFAULT 19 CHECK(reminder_hour BETWEEN 0 AND 23),
  preferred_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_weekly_goals (
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  goal_key TEXT NOT NULL,
  target INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  reward_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY(profile_id,week_start,goal_key)
);

CREATE TABLE IF NOT EXISTS quiz_personal_records (
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  record_key TEXT NOT NULL,
  record_value NUMERIC NOT NULL DEFAULT 0,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(profile_id,record_key)
);

CREATE TABLE IF NOT EXISTS quiz_activity_feed (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'friends' CHECK(visibility IN ('public','friends','private')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quiz_activity_feed_profile_time ON quiz_activity_feed(profile_id,created_at DESC);

INSERT INTO quiz_retention_profiles(profile_id)
SELECT id FROM quiz_solo_profiles
ON CONFLICT(profile_id) DO NOTHING;
