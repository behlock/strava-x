-- UNIQUE(athlete_id) in 001 already creates a btree index on athlete_id, so
-- the explicit published_maps_athlete_id_idx is a duplicate that only costs
-- write time and storage.
DROP INDEX IF EXISTS published_maps_athlete_id_idx;
