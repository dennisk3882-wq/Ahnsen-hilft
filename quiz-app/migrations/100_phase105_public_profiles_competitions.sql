ALTER TABLE quiz_account_preferences
  ADD COLUMN IF NOT EXISTS profile_visibility TEXT NOT NULL DEFAULT 'public';

UPDATE quiz_account_preferences
   SET profile_visibility=CASE WHEN public_profile THEN 'public' ELSE 'private' END
 WHERE profile_visibility IS NULL
    OR profile_visibility NOT IN ('public','friends','private');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname='quiz_account_preferences_profile_visibility_check'
  ) THEN
    ALTER TABLE quiz_account_preferences
      ADD CONSTRAINT quiz_account_preferences_profile_visibility_check
      CHECK(profile_visibility IN ('public','friends','private'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS quiz_phase105_profile_settings (
  profile_id UUID PRIMARY KEY REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  bio TEXT NOT NULL DEFAULT '',
  featured_badges JSONB NOT NULL DEFAULT '[]'::jsonb,
  show_recent_matches BOOLEAN NOT NULL DEFAULT TRUE,
  show_favorite_categories BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO quiz_phase105_profile_settings(profile_id)
SELECT id FROM quiz_solo_profiles
ON CONFLICT(profile_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS quiz_phase10_league_archive_profile_time
  ON quiz_phase10_league_archive(profile_id,archived_at DESC);

CREATE INDEX IF NOT EXISTS quiz_phase10_events_calendar
  ON quiz_phase10_events(starts_at,ends_at,active);

CREATE INDEX IF NOT EXISTS quiz_phase10_event_entries_profile_time
  ON quiz_phase10_event_entries(profile_id,completed_at DESC);
