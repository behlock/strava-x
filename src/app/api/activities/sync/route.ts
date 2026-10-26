import { type NextRequest } from 'next/server'
import { authenticateAthlete, enforceRateLimit, isAccessToken, jsonError, readJsonBody } from '@/lib/api'
import { serializeActivities } from '@/lib/activities-serialize'
import { ensureShare, shareState } from '@/lib/sharing-db'
import { canonicalSnapshot, publicActivities, type ShareState, type VerifiedSnapshot } from '@/lib/share-snapshot'
import { digest, hasSafeRouteGrant, signProof } from '@/lib/sharing-proof'
import { fetchAllActivities } from '@/lib/strava'
import type { Activity } from '@/models/activity'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Nothing is committed until every Strava page has succeeded. */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'activities-sync', { windowMs: 60_000, max: 6 })
  if (limited) return limited
  const body = await readJsonBody<{ accessToken?: unknown; routeAccessProof?: unknown }>(req)
  if (!isAccessToken(body?.accessToken)) return jsonError('missing_access_token')
  const auth = await authenticateAthlete(body.accessToken)
  if (!auth.ok) return jsonError(auth.error, auth.status)
  try {
    // Capture the revision BEFORE fetching, not after: a concurrent stop or
    // rename must invalidate this sync, even if the activity download is slow.
    let share: ShareState | null = null
    try {
      share = shareState(await ensureShare(auth.athlete.athleteId))
    } catch {
      // Personal sync can proceed, but no public proof is issued without a revision.
    }
    const byId = new Map<string, Activity>()
    await fetchAllActivities(body.accessToken, {
      signal: req.signal,
      onBatch: (batch) => {
        for (const activity of batch) byId.set(activity.id, activity)
      },
    })
    const activities = [...byId.values()]
    let snapshot: VerifiedSnapshot | null = null
    if (share) {
      try {
        const routesVerified = hasSafeRouteGrant(body.routeAccessProof, body.accessToken)
        const publicSnapshot = publicActivities(activities, routesVerified)
        const canonical = canonicalSnapshot(publicSnapshot)
        if (Buffer.byteLength(canonical) <= 25 * 1024 * 1024) {
          const fingerprint = digest(canonical)
          const expiresAt = Date.now() + 10 * 60_000
          const proof = signProof(
            'snapshot',
            { athleteId: share.athleteId, revision: share.revision, fingerprint, policy: 1 },
            expiresAt,
          )
          snapshot = {
            activities: publicSnapshot,
            proof,
            fingerprint,
            athleteId: share.athleteId,
            revision: share.revision,
            expiresAt,
            routesVerified,
          }
        }
      } catch {
        // Sharing validation/configuration must not discard a complete personal sync.
      }
    }
    const json = JSON.stringify({
      athleteId: auth.athlete.athleteId,
      activities: serializeActivities(activities),
      share,
      snapshot,
    })
    // Stream the response: full libraries can exceed a serverless buffered
    // response limit. Browser transparently decodes the gzip stream.
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
    return new Response(stream, {
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    return jsonError(
      ['strava_unauthorized', 'strava_rate_limited', 'strava_library_too_large'].includes(code) ? code : 'sync_failed',
      502,
    )
  }
}
