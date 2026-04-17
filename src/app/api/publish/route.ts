import { NextRequest, NextResponse } from 'next/server'
import { put, del } from '@vercel/blob'

import { validateSlug } from '@/lib/slug'
import { verifyStravaToken, StravaAuthError } from '@/lib/strava-verify'
import { deleteByAthleteId, findByAthleteId, findBySlug, upsertPublishedMap } from '@/lib/db'
import type { SerializedActivity } from '@/lib/activities-serialize'

export const runtime = 'nodejs'

const PAYLOAD_HARD_LIMIT_BYTES = 25 * 1024 * 1024
const PAYLOAD_VERSION = 1
const BLOB_CACHE_MAX_AGE_SECONDS = 60 * 60 // 1h — blob URLs are stored in DB, so republish updates propagate via the DB row, not the blob URL.

// Athlete-scoped pathnames so concurrent publishes of the same slug by
// different athletes don't collide on the blob store. Any rollback or
// slug-change cleanup touches only the athlete's own blob.
function blobPathnameFor(athleteId: number, slug: string): string {
  return `published/${athleteId}/${slug}.json`
}

function badRequest(error: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

interface PublishBody {
  slug?: unknown
  accessToken?: unknown
  activities?: unknown
  displayName?: unknown
}

export async function POST(req: NextRequest) {
  let body: PublishBody
  try {
    body = (await req.json()) as PublishBody
  } catch {
    return badRequest('invalid_json')
  }

  const { slug: rawSlug, accessToken, activities, displayName } = body

  if (typeof rawSlug !== 'string') return badRequest('invalid_slug')
  const slugResult = validateSlug(rawSlug)
  if (!slugResult.ok) return badRequest(slugResult.error === 'reserved' ? 'slug_reserved' : 'invalid_slug')
  const slug = slugResult.slug

  if (typeof accessToken !== 'string' || accessToken.length === 0) return badRequest('missing_access_token')
  if (!Array.isArray(activities)) return badRequest('invalid_activities')
  if (activities.length === 0) return badRequest('no_activities')

  // Verify the caller actually owns the athlete they're about to publish as.
  let athlete
  try {
    athlete = await verifyStravaToken(accessToken)
  } catch (e) {
    if (e instanceof StravaAuthError && e.reason === 'unauthorized') {
      return badRequest('strava_auth_failed', 401)
    }
    return badRequest('strava_verify_failed', 502)
  }

  // Reject the publish if the slug is already owned by a different athlete.
  const existingBySlug = await findBySlug(slug)
  if (existingBySlug && existingBySlug.athlete_id !== athlete.athleteId) {
    return badRequest('slug_taken', 409)
  }

  // Build the payload. JSON.stringify once — we need the string anyway for the
  // blob upload, and re-stringifying to size-check would double the work.
  const payload = {
    version: PAYLOAD_VERSION,
    publishedAt: new Date().toISOString(),
    displayName: (typeof displayName === 'string' ? displayName : athlete.displayName) ?? null,
    activities: activities as SerializedActivity[],
  }
  const json = JSON.stringify(payload)
  const sizeBytes = Buffer.byteLength(json, 'utf8')
  if (sizeBytes > PAYLOAD_HARD_LIMIT_BYTES) {
    return badRequest('payload_too_large', 413, { sizeBytes, limit: PAYLOAD_HARD_LIMIT_BYTES })
  }

  // If this athlete already owns a publish, we'll clean up the old blob
  // after the new write succeeds. Compare pathnames (not just slugs) so a
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
    return badRequest('blob_write_failed', 502)
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
    try {
      await del(pathname)
    } catch {}
    // The most common cause of an upsert failure here is the slug getting
    // claimed by a different athlete between our findBySlug check and the
    // insert. Re-check so the user sees the specific error.
    const raced = await findBySlug(slug).catch(() => null)
    if (raced && raced.athlete_id !== athlete.athleteId) {
      return badRequest('slug_taken', 409)
    }
    return badRequest('db_write_failed', 502)
  }

  if (oldPathname) {
    // Slug or pathname format changed — drop the old blob. Best-effort; a
    // stale blob is cheap compared to surfacing an error to the user after
    // a successful publish.
    try {
      await del(oldPathname)
    } catch (e) {
      console.warn('[publish] failed to delete old blob', oldPathname, e)
    }
  }

  return NextResponse.json({
    slug,
    url: `/${slug}`,
    blobUrl,
    activityCount: activities.length,
    sizeBytes,
  })
}

interface UnpublishBody {
  accessToken?: unknown
}

export async function DELETE(req: NextRequest) {
  let body: UnpublishBody
  try {
    body = (await req.json()) as UnpublishBody
  } catch {
    return badRequest('invalid_json')
  }
  const { accessToken } = body
  if (typeof accessToken !== 'string' || accessToken.length === 0) return badRequest('missing_access_token')

  let athlete
  try {
    athlete = await verifyStravaToken(accessToken)
  } catch (e) {
    if (e instanceof StravaAuthError && e.reason === 'unauthorized') {
      return badRequest('strava_auth_failed', 401)
    }
    return badRequest('strava_verify_failed', 502)
  }

  const existing = await findByAthleteId(athlete.athleteId)
  if (!existing) {
    return NextResponse.json({ ok: true, wasPublished: false })
  }

  try {
    await del(existing.blob_pathname)
  } catch (e) {
    console.warn('[unpublish] blob delete failed', e)
  }

  await deleteByAthleteId(athlete.athleteId)

  return NextResponse.json({ ok: true, wasPublished: true })
}
