import { NextRequest, NextResponse } from 'next/server'

import { validateSlug } from '@/lib/slug'
import { findBySlug } from '@/lib/db'
import { verifyStravaToken, StravaAuthError } from '@/lib/strava-verify'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const MAX_ACCESS_TOKEN_LENGTH = 200
const MAX_SLUG_LENGTH = 100 // intentionally larger than validateSlug's regex so invalid inputs still get cheap validation errors instead of being rejected early

interface CheckBody {
  slug?: unknown
  accessToken?: unknown
}

// POST /api/publish/check — body: { slug, accessToken? }.
// Returns { available, reason?, ownedByMe? }.
//
// The access token is sent in the POST body rather than a query string so it
// doesn't land in CDN / server access logs or the Referer header.
export async function POST(req: NextRequest) {
  // Higher limit than publish itself since the dialog calls this on every
  // keystroke. Still bounded so a runaway client can't fan out to Strava.
  const rl = rateLimit(clientKey(req, 'publish-check'), { windowMs: 60_000, max: 60 })
  if (!rl.ok) return tooManyRequests(rl.retryAfterSeconds ?? 60)

  let body: CheckBody
  try {
    body = (await req.json()) as CheckBody
  } catch {
    return NextResponse.json({ available: false, reason: 'invalid_json' }, { status: 400 })
  }

  const { slug: rawSlug, accessToken } = body
  if (typeof rawSlug !== 'string' || rawSlug.length > MAX_SLUG_LENGTH) {
    return NextResponse.json({ available: false, reason: 'missing_slug' }, { status: 400 })
  }

  const slugResult = validateSlug(rawSlug)
  if (!slugResult.ok) {
    return NextResponse.json({
      available: false,
      reason: slugResult.error === 'reserved' ? 'slug_reserved' : 'invalid_slug',
    })
  }

  const existing = await findBySlug(slugResult.slug)
  if (!existing) {
    return NextResponse.json({ available: true })
  }

  if (typeof accessToken !== 'string' || accessToken.length === 0 || accessToken.length > MAX_ACCESS_TOKEN_LENGTH) {
    return NextResponse.json({ available: false, reason: 'slug_taken' })
  }

  let athleteId: number
  try {
    athleteId = (await verifyStravaToken(accessToken)).athleteId
  } catch (e) {
    if (e instanceof StravaAuthError && e.reason === 'unauthorized') {
      return NextResponse.json({ available: false, reason: 'auth_failed' })
    }
    return NextResponse.json({ available: false, reason: 'strava_verify_failed' }, { status: 502 })
  }

  if (existing.athlete_id === athleteId) {
    return NextResponse.json({ available: true, ownedByMe: true })
  }
  return NextResponse.json({ available: false, reason: 'slug_taken' })
}
