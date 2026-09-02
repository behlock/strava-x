import { type NextRequest, NextResponse } from 'next/server'

import { authenticateAthlete, enforceRateLimit, isAccessToken, readJsonBody } from '@/lib/api'
import { findBySlug } from '@/lib/db'
import { validateSlug } from '@/lib/slug'

export const runtime = 'nodejs'

// Generous upper bound — validateSlug enforces the real regex.
const MAX_SLUG_LENGTH = 100

interface CheckBody {
  slug?: unknown
  accessToken?: unknown
}

function unavailable(reason: string, status = 200) {
  return NextResponse.json({ available: false, reason }, { status })
}

// POST /api/publish/check — body: { slug, accessToken? }.
// Returns { available, reason?, ownedByMe? }.
//
// The access token is sent in the POST body rather than a query string so it
// doesn't land in CDN / server access logs or the Referer header.
export async function POST(req: NextRequest) {
  // Higher limit than publish itself since the dialog calls this on every
  // keystroke. Still bounded so a runaway client can't fan out to Strava.
  const limited = enforceRateLimit(req, 'publish-check', { windowMs: 60_000, max: 60 })
  if (limited) return limited

  const body = await readJsonBody<CheckBody>(req)
  if (!body) return unavailable('invalid_json', 400)

  const { slug: rawSlug, accessToken } = body
  if (typeof rawSlug !== 'string' || rawSlug.length > MAX_SLUG_LENGTH) return unavailable('missing_slug', 400)

  const slugResult = validateSlug(rawSlug)
  if (!slugResult.ok) return unavailable(slugResult.error === 'reserved' ? 'slug_reserved' : 'invalid_slug')

  const existing = await findBySlug(slugResult.slug)
  if (!existing) return NextResponse.json({ available: true })

  // Taken — unless it's taken by the caller themselves.
  if (!isAccessToken(accessToken)) return unavailable('slug_taken')

  const auth = await authenticateAthlete(accessToken)
  if (!auth.ok) {
    return auth.error === 'strava_auth_failed' ? unavailable('auth_failed') : unavailable(auth.error, auth.status)
  }

  if (existing.athlete_id === auth.athlete.athleteId) return NextResponse.json({ available: true, ownedByMe: true })
  return unavailable('slug_taken')
}
