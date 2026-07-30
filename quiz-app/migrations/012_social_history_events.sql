CREATE TABLE IF NOT EXISTS quiz_friend_preferences (
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(profile_id,friend_id),
  CHECK(profile_id<>friend_id)
);

CREATE TABLE IF NOT EXISTS quiz_phase10_history_hidden (
  profile_id UUID NOT NULL REFERENCES quiz_solo_profiles(id) ON DELETE CASCADE,
  history_id UUID NOT NULL REFERENCES quiz_phase10_match_history(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(profile_id,history_id)
);

ALTER TABLE quiz_phase10_events
  ADD COLUMN IF NOT EXISTS publication_status TEXT NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS source_event_id UUID REFERENCES quiz_phase10_events(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='quiz_phase10_events_publication_status_check'
  ) THEN
    ALTER TABLE quiz_phase10_events
      ADD CONSTRAINT quiz_phase10_events_publication_status_check
      CHECK(publication_status IN ('draft','published'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS quiz_phase10_events_publication
  ON quiz_phase10_events(publication_status,active,starts_at,ends_at);
