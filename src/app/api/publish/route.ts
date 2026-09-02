import { gunzipSync } from 'node:zlib'
import { type NextRequest, NextResponse } from 'next/server'
import { del, put } from '@vercel/blob'

import { authenticateAthlete, enforceRateLimit, isAccessToken, jsonError, readJsonBody } from '@/lib/api'
import type { SerializedActivity } from '@/lib/activities-serialize'
import { deleteByAthleteId, findByAthleteId, findBySlug, upsertPublishedMap } from '@/lib/db'
import { validateSlug } from '@/lib/slug'

export const runtime = 'nodejs'

const PAYLOAD_HARD_LIMIT_BYTES = 25 * 1024 * 1024
const PAYLOAD_VERSION = 1
// Five minutes balances CDN benefit against unpublish recency — after a user
// unpublishes, stale content on the edge clears within this window.
const BLOB_CACHE_MAX_AGE_SECONDS = 5 * 60
const MAX_DISPLAY_NAME_LENGTH = 100
const MAX_ACTIVITIES = 50_000

function blobPathnameFor(athleteId: number, slug: string): string {
  return `published/${athleteId}/${slug}.json`
}

interface PublishBody {
  slug?: unknown
  accessToken?: unknown
  activities?: unknown
  displayName?: unknown
}

// Vercel's serverless platform caps inbound bodies (~4.5 MB), so the activity
// payload — which can comfortably exceed that — is gzipped client-side. We
// also enforce a decompressed-size cap to bound zip-bomb risk before parsing.
async function readPublishBody(req: NextRequest): Promise<PublishBody | NextResponse> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase()
  if (!contentType.includes('gzip')) {
    return (await readJsonBody<PublishBody>(req)) ?? jsonError('invalid_json')
  }
  try {
    const compressed = Buffer.from(await req.arrayBuffer())
    const decompressed = gunzipSync(compressed, { maxOutputLength: PAYLOAD_HARD_LIMIT_BYTES })
    return JSON.parse(decompressed.toString('utf8')) as PublishBody
  } catch (e) {
    return e instanceof RangeError ? jsonError('payload_too_large', 413) : jsonError('invalid_json')
  }
}

// POST /api/publish — body (gzip or JSON): { slug, accessToken, activities, displayName? }.
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'publish-post', { windowMs: 60_000, max: 10 })
  if (limited) return limited

  const body = await readPublishBody(req)
  if (body instanceof NextResponse) return body
  const { slug: rawSlug, accessToken, activities, displayName } = body

  if (typeof rawSlug !== 'string') return jsonError('invalid_slug')
  const slugResult = validateSlug(rawSlug)
  if (!slugResult.ok) return jsonError(slugResult.error === 'reserved' ? 'slug_reserved' : 'invalid_slug')
  const slug = slugResult.slug

  if (!isAccessToken(accessToken)) return jsonError('missing_access_token')
  if (!Array.isArray(activities)) return jsonError('invalid_activities')
  if (activities.length === 0) return jsonError('no_activities')
  if (activities.length > MAX_ACTIVITIES) return jsonError('too_many_activities', 413)

  // Verify the caller actually owns the athlete they're about to publish as.
  const auth = await authenticateAthlete(accessToken)
  if (!auth.ok) return jsonError(auth.error, auth.status)
  const { athlete } = auth

  // Reject the publish if the slug is already owned by a different athlete.
  const existingBySlug = await findBySlug(slug)
  if (existingBySlug && existingBySlug.athlete_id !== athlete.athleteId) return jsonError('slug_taken', 409)

  // Caller-supplied displayName is bounded so it can't bloat the blob payload
  // or break Open Graph scrapers. JSX escaping handles XSS at render time.
  const normalizedDisplayName =
    typeof displayName === 'string' ? displayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH) || null : null

  // Stringify once — the string is needed for the upload anyway, and it
  // doubles as the size check.
  const payload = {
    version: PAYLOAD_VERSION,
    publishedAt: new Date().toISOString(),
    displayName: normalizedDisplayName ?? athlete.displayName,
    activities: activities as SerializedActivity[],
  }
  const json = JSON.stringify(payload)
  const sizeBytes = Buffer.byteLength(json, 'utf8')
  if (sizeBytes > PAYLOAD_HARD_LIMIT_BYTES) {
    return jsonError('payload_too_large', 413, { sizeBytes, limit: PAYLOAD_HARD_LIMIT_BYTES })
  }

  // If this athlete already owns a publish, the old blob is cleaned up after
  // the new write succeeds. Compare pathnames (not just slugs) so a
  // pathname-format migration also cleans up.
  const existingByAthlete = await findByAthleteId(athlete.athleteId)
  const pathname = blobPathnameFor(athlete.athleteId, slug)
  const oldPathname =
    existingByAthlete && existingByAthlete.blob_pathname !== pathname ? existingByAthlete.blob_pathname : null

  let blobUrl: string
  try {
    const result = await put(pathname, json, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: BLOB_CACHE_MAX_AGE_SECONDS,
    })
    blobUrl = result.url
  } catch (e) {
    console.error('[publish] blob put failed', e)
    return jsonError('blob_write_failed', 502)
  }

  try {
    await upsertPublishedMap({
      slug,
      athleteId: athlete.athleteId,
      athleteDisplayName: payload.displayName,
      blobUrl,
      blobPathname: pathname,
      activityCount: activities.length,
      sizeBytes,
    })
  } catch (e) {
    console.error('[publish] db upsert failed', e)
    // Best-effort rollback of the athlete's own blob — the pathname is
    // athlete-scoped, so this can't delete anyone else's data even on a
    // concurrent-publish race.
    await del(pathname).catch(() => {})
    const raced = await findBySlug(slug).catch(() => null)
    if (raced && raced.athlete_id !== athlete.athleteId) return jsonError('slug_taken', 409)
    return jsonError('db_write_failed', 502)
  }

  if (oldPathname) {
    await del(oldPathname).catch((e) => console.warn('[publish] failed to delete old blob', oldPathname, e))
  }

  return NextResponse.json({ slug, url: `/${slug}`, blobUrl, activityCount: activities.length, sizeBytes })
}

interface UnpublishBody {
  accessToken?: unknown
}

// DELETE /api/publish — body: { accessToken }.
export async function DELETE(req: NextRequest) {
  const limited = enforceRateLimit(req, 'publish-delete', { windowMs: 60_000, max: 10 })
  if (limited) return limited

  const body = await readJsonBody<UnpublishBody>(req)
  if (!body) return jsonError('invalid_json')
  if (!isAccessToken(body.accessToken)) return jsonError('missing_access_token')

  const auth = await authenticateAthlete(body.accessToken)
  if (!auth.ok) return jsonError(auth.error, auth.status)

  const existing = await findByAthleteId(auth.athlete.athleteId)
  if (!existing) return NextResponse.json({ ok: true, wasPublished: false })

  await del(existing.blob_pathname).catch((e) => console.warn('[unpublish] blob delete failed', e))
  await deleteByAthleteId(auth.athlete.athleteId)

  return NextResponse.json({ ok: true, wasPublished: true })
}
