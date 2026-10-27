import { Duplex } from 'node:stream'
import { constants, createGzip } from 'node:zlib'
import { type NextRequest } from 'next/server'
import { authenticateAthlete, enforceRateLimit, isAccessToken, jsonError, readJsonBody } from '@/lib/api'
import { serializeActivities } from '@/lib/activities-serialize'
import { ensureShare, shareState } from '@/lib/sharing-db'
import { canonicalSnapshot, publicActivities, type ShareState, type VerifiedSnapshot } from '@/lib/share-snapshot'
import { digest, signProof } from '@/lib/sharing-proof'
import { fetchAllActivities } from '@/lib/strava'
import type { Activity } from '@/models/activity'
import type { ActivitySyncEvent, ActivitySyncResult } from '@/lib/activity-sync-stream'
import { getActivityVersion } from '@/lib/activity-sync-db'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Nothing is committed until every Strava page has succeeded. */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'activities-sync', { windowMs: 60_000, max: 6 })
  if (limited) return limited
  const body = await readJsonBody<{ accessToken?: unknown }>(req)
  if (!isAccessToken(body?.accessToken)) return jsonError('missing_access_token')
  const accessToken = body.accessToken
  const auth = await authenticateAthlete(accessToken)
  if (!auth.ok) return jsonError(auth.error, auth.status)
  if (req.headers.get('Accept')?.includes('application/x-ndjson')) {
    const abort = new AbortController()
    const signal = AbortSignal.any([req.signal, abort.signal])
    let cancelled = false
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: ActivitySyncEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        try {
          send({ type: 'start', athleteId: auth.athlete.athleteId })
          const result = await syncLibrary(accessToken, auth.athlete.athleteId, signal, (batch) => {
            signal.throwIfAborted()
            send({ type: 'batch', activities: serializeActivities(batch) })
          })
          signal.throwIfAborted()
          const { activities, ...metadata } = result
          send({ type: 'complete', result: metadata, count: activities.length })
        } catch (error) {
          if (!cancelled) send({ type: 'error', error: syncErrorCode(error) })
        } finally {
          if (!cancelled) controller.close()
        }
      },
      cancel() {
        cancelled = true
        abort.abort()
      },
    })
    // Flush every batch so gzip does not hold early routes until the sync finishes.
    const gzip = Duplex.toWeb(createGzip({ flush: constants.Z_SYNC_FLUSH })) as unknown as ReadableWritablePair<
      Uint8Array,
      Uint8Array
    >
    return new Response(stream.pipeThrough(gzip), {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'private, no-store, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  }
  try {
    const result = await syncLibrary(accessToken, auth.athlete.athleteId, req.signal)
    const json = JSON.stringify(result)
    // Stream the response: full libraries can exceed a serverless buffered
    // response limit. Browser transparently decodes the gzip stream.
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
    return new Response(stream, {
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    return jsonError(syncErrorCode(error), 502)
  }
}

function syncErrorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return ['strava_unauthorized', 'strava_rate_limited', 'strava_library_too_large'].includes(code)
    ? code
    : 'sync_failed'
}

async function syncLibrary(
  accessToken: string,
  athleteId: number,
  signal: AbortSignal,
  onBatch?: (batch: Activity[]) => void,
): Promise<ActivitySyncResult> {
  const version = await getActivityVersion(athleteId).catch(() => null)
  // Capture the revision BEFORE fetching, not after: a concurrent stop or
  // rename must invalidate this sync, even if the activity download is slow.
  let share: ShareState | null = null
  try {
    share = shareState(await ensureShare(athleteId))
  } catch {
    // Personal sync can proceed, but no public proof is issued without a revision.
  }
  const byId = new Map<string, Activity>()
  await fetchAllActivities(accessToken, {
    signal,
    onBatch: (batch) => {
      for (const activity of batch) byId.set(activity.id, activity)
      onBatch?.(batch)
    },
  })
  const activities = [...byId.values()]
  let snapshot: VerifiedSnapshot | null = null
  if (share) {
    try {
      const publicSnapshot = publicActivities(activities)
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
        }
      }
    } catch {
      // Sharing validation/configuration must not discard a complete personal sync.
    }
  }
  return {
    athleteId,
    activities: serializeActivities(activities),
    share,
    snapshot,
    sync: { version, syncedAt: Date.now(), fingerprint: snapshot?.fingerprint ?? null },
  }
}
