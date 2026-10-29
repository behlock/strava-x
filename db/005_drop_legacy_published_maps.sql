-- Refuse removal if an old account was not migrated to the current sharing table.
DO $$
BEGIN
  IF to_regclass('public.published_maps') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.published_maps old_share
      LEFT JOIN public.map_shares current_share USING (athlete_id)
      WHERE current_share.athlete_id IS NULL
    ) THEN
      RAISE EXCEPTION 'published_maps contains accounts missing from map_shares';
    END IF;
    DROP TABLE public.published_maps;
  END IF;
END $$;
