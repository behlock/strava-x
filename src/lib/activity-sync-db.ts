import { neon } from '@neondatabase/serverless'
import { webhookSubscriptionId } from './strava-webhook-config'

const sql = () => neon(process.env.POSTGRES_URL || process.env.DATABASE_URL || '')

export async function getActivityVersion(athleteId: number): Promise<string> {
  const db = sql()
  const existing = await db`SELECT version FROM athlete_activity_versions WHERE athlete_id=${athleteId}`
  const prefix = webhookSubscriptionId() ?? 'poll'
  if (existing[0]) return `${prefix}:${existing[0].version}`
  const rows = await db`
    INSERT INTO athlete_activity_versions (athlete_id) VALUES (${athleteId})
    ON CONFLICT (athlete_id) DO UPDATE SET athlete_id=EXCLUDED.athlete_id RETURNING version
  `
  return `${prefix}:${rows[0].version}`
}

export async function recordActivityChange(athleteId: number, eventKey: string, revoked: boolean): Promise<void> {
  await sql()`
    WITH changed AS (
      INSERT INTO athlete_activity_versions (athlete_id, version, last_event_key)
      SELECT ${athleteId}, 1, ${eventKey}
      WHERE EXISTS (SELECT 1 FROM athlete_activity_versions WHERE athlete_id=${athleteId})
         OR EXISTS (SELECT 1 FROM map_shares WHERE athlete_id=${athleteId})
      ON CONFLICT (athlete_id) DO UPDATE
      SET version=athlete_activity_versions.version+1, last_event_key=EXCLUDED.last_event_key
      WHERE athlete_activity_versions.last_event_key IS DISTINCT FROM EXCLUDED.last_event_key
      RETURNING athlete_id
    ), locked AS (
      SELECT athlete_id, snapshot_path FROM map_shares
      WHERE athlete_id IN (SELECT athlete_id FROM changed) AND ${revoked}
      FOR UPDATE
    ), stopped AS (
      UPDATE map_shares AS shares SET active=false, revision=revision+1, snapshot_path=NULL,
        fingerprint=NULL, activity_count=0, size_bytes=0, updated_at=NULL
      FROM locked WHERE shares.athlete_id=locked.athlete_id
      RETURNING locked.snapshot_path
    )
    INSERT INTO sharing_blob_cleanup (pathname, store)
    SELECT snapshot_path, 'private' FROM stopped WHERE snapshot_path IS NOT NULL
    ON CONFLICT DO NOTHING
  `
}
