-- Separate versioned records keep old application upserts away from the new
-- publication state. Tombstones survive unsharing; revisions never reset.
CREATE TABLE map_shares (
  athlete_id BIGINT PRIMARY KEY,
  slug TEXT UNIQUE,
  active BOOLEAN NOT NULL DEFAULT false,
  revision BIGINT NOT NULL DEFAULT 0,
  athlete_display_name TEXT,
  snapshot_path TEXT,
  fingerprint TEXT,
  activity_count INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ,
  CHECK (NOT active OR slug IS NOT NULL)
);
-- Reserve existing addresses, but never serve unverified legacy snapshots.
INSERT INTO map_shares (athlete_id, slug, active, athlete_display_name)
SELECT athlete_id, slug, true, athlete_display_name FROM published_maps;

-- Durable cleanup queue. Failed deletes remain retryable, including legacy
-- public files. New files are private even before they become live.
CREATE TABLE sharing_blob_cleanup (
  pathname TEXT PRIMARY KEY,
  store TEXT NOT NULL CHECK (store IN ('legacy', 'private')),
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO sharing_blob_cleanup (pathname, store)
SELECT blob_pathname, 'legacy' FROM published_maps ON CONFLICT DO NOTHING;
