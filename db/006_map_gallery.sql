ALTER TABLE map_shares ADD COLUMN top_city TEXT;
CREATE INDEX map_shares_gallery_activities ON map_shares (activity_count DESC, slug)
  WHERE active AND slug IS NOT NULL AND snapshot_path IS NOT NULL;
CREATE INDEX map_shares_gallery_city ON map_shares (top_city, slug)
  WHERE active AND slug IS NOT NULL AND snapshot_path IS NOT NULL;
