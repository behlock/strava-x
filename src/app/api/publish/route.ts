import { gunzipSync } from 'node:zlib'
import { after, type NextRequest, NextResponse } from 'next/server'
import { authenticateAthlete, enforceRateLimit, isAccessToken, jsonError, readBoundedBody } from '@/lib/api'
import { compareAndSwapShare, ensureShare, queueBlobCleanup, shareState } from '@/lib/sharing-db'
import { mutateShare, SharingError } from '@/lib/sharing-service'
import { drainBlobCleanup, writePrivateSnapshot } from '@/lib/sharing-storage'
import { validateSlug } from '@/lib/slug'

export const runtime = 'nodejs'
const LIMIT = 25 * 1024 * 1024

async function mutate(req: NextRequest, stopping: boolean) {
  const limited = enforceRateLimit(req, 'sharing-write', { windowMs: 60_000, max: 15 })
  if (limited) return limited
  let body: Record<string, unknown>
  try {
    // Bound both compressed input and decompressed JSON, including chunked requests.
    const input = await readBoundedBody(req, LIMIT)
    if (!input) return jsonError('payload_too_large', 413)
    const raw = req.headers.get('content-type')?.includes('gzip')
      ? gunzipSync(input, { maxOutputLength: LIMIT })
      : input
    body = JSON.parse(raw.toString('utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonError('invalid_json')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ERR_BUFFER_TOO_LARGE') return jsonError('payload_too_large', 413)
    return jsonError('invalid_json')
  }
  if (!isAccessToken(body.accessToken)) return jsonError('missing_access_token')
  if (typeof body.revision !== 'string' || !/^\d{1,19}$/.test(body.revision))
    return jsonError('publication_changed', 409)
  const action = stopping ? 'stop' : body.action
  if (action !== 'stop' && action !== 'create' && action !== 'update' && action !== 'rename')
    return jsonError('invalid_action')
  let slug: string | undefined
  if (action === 'create' || action === 'rename') {
    const checked = validateSlug(typeof body.slug === 'string' ? body.slug : '')
    if (!checked.ok) return jsonError(checked.error === 'reserved' ? 'slug_reserved' : 'invalid_slug')
    slug = checked.slug
  }
  const auth = await authenticateAthlete(body.accessToken)
  if (!auth.ok) return jsonError(auth.error, auth.status)
  try {
    const row = await mutateShare(
      { read: ensureShare, commit: compareAndSwapShare, upload: writePrivateSnapshot, discard: queueBlobCleanup },
      {
        athleteId: auth.athlete.athleteId,
        displayName: auth.athlete.displayName,
        revision: body.revision,
        action,
        slug,
        activities: body.activities,
        proof: body.proof,
      },
    )
    return NextResponse.json(
      {
        ...shareState(row),
        url: row.slug ? `/${row.slug}` : null,
        activityCount: row.activity_count,
        sizeBytes: row.size_bytes,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if ((error as { code?: string })?.code === '23505') return jsonError('slug_taken', 409)
    if (error instanceof SharingError)
      return jsonError(error.message, error.message === 'publication_changed' ? 409 : 400)
    if (error instanceof Error && error.message === 'sharing_not_configured') return jsonError(error.message, 503)
    if (error instanceof Error && error.message === 'invalid_activities') return jsonError(error.message, 400)
    console.error('[sharing] write failed')
    return jsonError('sharing_failed', 502)
  } finally {
    after(() => drainBlobCleanup().catch(() => {}))
  }
}
export const POST = (req: NextRequest) => mutate(req, false)
export const DELETE = (req: NextRequest) => mutate(req, true)
