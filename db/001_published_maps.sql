CREATE TABLE IF NOT EXISTS published_maps (
  slug                 TEXT PRIMARY KEY,
  athlete_id           BIGINT NOT NULL UNIQUE,
  athlete_display_name TEXT,
  blob_url             TEXT NOT NULL,
  blob_pathname        TEXT NOT NULL,
  activity_count       INTEGER NOT NULL,
  size_bytes           INTEGER NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS published_maps_athlete_id_idx ON published_maps(athlete_id);
