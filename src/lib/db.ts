import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

// Lazy singleton: we defer calling `neon()` until a query actually runs so
// that `next build` (which evaluates server modules with no env set) doesn't
// fail. Callers that actually need the DB will hit a clear error at request
// time if the env var is missing.
let _sql: NeonQueryFunction<false, false> | null = null

function getSql(): NeonQueryFunction<false, false> {
  if (_sql) return _sql
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('POSTGRES_URL / DATABASE_URL is not set')
  }
  _sql = neon(connectionString)
  return _sql
}

export interface PublishedMapRow {
  slug: string
  athlete_id: number
  athlete_display_name: string | null
  blob_url: string
  blob_pathname: string
  activity_count: number
  size_bytes: number
  created_at: string
  updated_at: string
}

export async function findBySlug(slug: string): Promise<PublishedMapRow | null> {
  const sql = getSql()
  const rows = (await sql`SELECT * FROM published_maps WHERE slug = ${slug} LIMIT 1`) as PublishedMapRow[]
  return rows[0] ?? null
}

export async function findByAthleteId(athleteId: number): Promise<PublishedMapRow | null> {
  const sql = getSql()
  const rows = (await sql`SELECT * FROM published_maps WHERE athlete_id = ${athleteId} LIMIT 1`) as PublishedMapRow[]
  return rows[0] ?? null
}

export async function upsertPublishedMap(row: {
  slug: string
  athleteId: number
  athleteDisplayName: string | null
  blobUrl: string
  blobPathname: string
  activityCount: number
  sizeBytes: number
}): Promise<void> {
  const sql = getSql()
  // Upsert on athlete_id — one map per athlete. If the athlete already has a
  // row, we overwrite slug + blob metadata with the new publish.
  await sql`
    INSERT INTO published_maps (
      slug, athlete_id, athlete_display_name, blob_url, blob_pathname,
      activity_count, size_bytes
    ) VALUES (
      ${row.slug}, ${row.athleteId}, ${row.athleteDisplayName}, ${row.blobUrl}, ${row.blobPathname},
      ${row.activityCount}, ${row.sizeBytes}
    )
    ON CONFLICT (athlete_id) DO UPDATE SET
      slug = EXCLUDED.slug,
      athlete_display_name = EXCLUDED.athlete_display_name,
      blob_url = EXCLUDED.blob_url,
      blob_pathname = EXCLUDED.blob_pathname,
      activity_count = EXCLUDED.activity_count,
      size_bytes = EXCLUDED.size_bytes,
      updated_at = now()
  `
}

export async function deleteByAthleteId(athleteId: number): Promise<void> {
  const sql = getSql()
  await sql`DELETE FROM published_maps WHERE athlete_id = ${athleteId}`
}
