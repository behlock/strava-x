import type { MapsSort, MapsOrder } from './maps-sort'
import { neon } from '@neondatabase/serverless'
import type { ShareState } from './share-snapshot'

export interface ShareRow {
  athlete_id: number
  slug: string | null
  active: boolean
  revision: string
  athlete_display_name: string | null
  snapshot_path: string | null
  fingerprint: string | null
  activity_count: number
  size_bytes: number
  top_city: string | null
  updated_at: string | null
}
const sql = () => neon(process.env.POSTGRES_URL || process.env.DATABASE_URL || '')

export async function randomPublishedMap(exclude: string | null, visited: string[] = []): Promise<string | null> {
  const rows = await sql()`SELECT slug FROM map_shares
    WHERE active AND slug IS NOT NULL AND snapshot_path IS NOT NULL
    ORDER BY CASE WHEN slug = ${exclude} THEN 1 ELSE 0 END,
      CASE WHEN slug = ANY(${visited}::text[]) THEN 1 ELSE 0 END, random()
    LIMIT 1`
  return (rows[0]?.slug as string | undefined) ?? null
}
const normalize = (row: ShareRow): ShareRow => ({
  ...row,
  athlete_id: Number(row.athlete_id),
  revision: String(row.revision),
})
export function shareState(row: ShareRow): ShareState {
  return {
    athleteId: row.athlete_id,
    slug: row.active ? row.slug : null,
    revision: row.revision,
    fingerprint: row.fingerprint,
  }
}
export async function ensureShare(athleteId: number): Promise<ShareRow> {
  const db = sql()
  await db`INSERT INTO map_shares (athlete_id) VALUES (${athleteId}) ON CONFLICT DO NOTHING`
  const rows = await db`SELECT * FROM map_shares WHERE athlete_id = ${athleteId}`
  return normalize(rows[0] as ShareRow)
}
export async function findShareBySlug(slug: string): Promise<ShareRow | null> {
  const rows = await sql()`SELECT * FROM map_shares WHERE slug = ${slug} AND active`
  return rows[0] ? normalize(rows[0] as ShareRow) : null
}

export interface ShareWrite {
  slug: string | null
  active: boolean
  displayName: string | null
  snapshotPath: string | null
  fingerprint: string | null
  activityCount: number
  sizeBytes: number
  topCity: string | null
  updatedAt: string | null
}
/** Revision comparison and cleanup enqueue are one database statement/transaction. */
export async function compareAndSwapShare(expected: ShareRow, next: ShareWrite): Promise<ShareRow | null> {
  const rows = await sql()`
    WITH changed AS (
      UPDATE map_shares SET slug=${next.slug}, active=${next.active}, revision=revision+1,
        athlete_display_name=${next.displayName}, snapshot_path=${next.snapshotPath},
        fingerprint=${next.fingerprint}, activity_count=${next.activityCount}, size_bytes=${next.sizeBytes},
        updated_at=${next.updatedAt}::timestamptz, top_city=${next.topCity}
      WHERE athlete_id=${expected.athlete_id} AND revision=${expected.revision}::bigint
      RETURNING *
    ), cleanup AS (
      INSERT INTO sharing_blob_cleanup (pathname, store)
      SELECT ${expected.snapshot_path}::text, 'private' FROM changed
      WHERE ${expected.snapshot_path}::text IS NOT NULL
        AND ${expected.snapshot_path}::text IS DISTINCT FROM ${next.snapshotPath}::text
      ON CONFLICT DO NOTHING
    ) SELECT * FROM changed
  `
  return rows[0] ? normalize(rows[0] as ShareRow) : null
}
export async function queueBlobCleanup(pathname: string): Promise<void> {
  await sql()`INSERT INTO sharing_blob_cleanup (pathname, store) VALUES (${pathname}, 'private') ON CONFLICT DO NOTHING`
}
export async function cleanupCandidates(): Promise<{ pathname: string; store: 'private' | 'legacy' }[]> {
  return (await sql()`SELECT pathname, store FROM sharing_blob_cleanup
    WHERE store='legacy' OR NOT EXISTS (SELECT 1 FROM map_shares WHERE active AND snapshot_path=pathname)
    ORDER BY queued_at LIMIT 25`) as { pathname: string; store: 'private' | 'legacy' }[]
}
export async function acknowledgeCleanup(pathname: string): Promise<void> {
  await sql()`DELETE FROM sharing_blob_cleanup WHERE pathname=${pathname}`
}

export interface PublishedMapSummary {
  slug: string
  activity_count: number
  city?: string | null
}

/** Only public listing fields; never expose owner IDs or storage paths. */
export async function listPublishedMaps(
  offset: number,
  limit: number,
  sort: MapsSort = 'activities',
  order: MapsOrder = 'desc',
): Promise<PublishedMapSummary[]> {
  return (await sql()`SELECT slug, activity_count, top_city AS city FROM map_shares
    WHERE active AND slug IS NOT NULL AND snapshot_path IS NOT NULL
    ORDER BY
      CASE WHEN ${sort === 'map' && order === 'asc'} THEN slug END ASC,
      CASE WHEN ${sort === 'map' && order === 'desc'} THEN slug END DESC,
      CASE WHEN ${sort === 'activities' && order === 'asc'} THEN activity_count END ASC,
      CASE WHEN ${sort === 'activities' && order === 'desc'} THEN activity_count END DESC,
      CASE WHEN ${sort === 'city' && order === 'asc'} THEN top_city END ASC NULLS LAST,
      CASE WHEN ${sort === 'city' && order === 'desc'} THEN top_city END DESC NULLS LAST,
      slug ASC LIMIT ${limit} OFFSET ${offset}`) as PublishedMapSummary[]
}
