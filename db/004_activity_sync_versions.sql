CREATE TABLE athlete_activity_versions (
  athlete_id BIGINT PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 0,
  last_event_key TEXT
);
