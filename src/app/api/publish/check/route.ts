import { NextRequest, NextResponse } from 'next/server'

import { validateSlug } from '@/lib/slug'
import { findBySlug } from '@/lib/db'
import { verifyStravaToken, StravaAuthError } from '@/lib/strava-verify'

export const runtime = 'nodejs'

interface CheckBody {
  slug?: unknown
  accessToken?: unknown
}

// POST /api/publish/check — body: { slug, accessToken? }.
// Returns { available, reason?, ownedByMe? }.
// - If no row exists: available=true.
// - If row exists and accessToken matches the owner: available=true, ownedByMe=true.
// - If row exists and caller is anonymous: available=false, reason="slug_taken".
// - If row exists and Strava auth fails: available=false, reason="auth_failed"
//   (distinct from slug_taken so the owner doesn't see a misleading message
//   when their session expires).
//
// The access token is sent in the POST body rather than a query string so it
// doesn't land in CDN / server access logs or the Referer header.
export async function POST(req: NextRequest) {
  let body: CheckBody
  try {
    body = (await req.json()) as CheckBody
  } catch {
    return NextResponse.json({ available: false, reason: 'invalid_json' }, { status: 400 })
  }

  const { slug: rawSlug, accessToken } = body
  if (typeof rawSlug !== 'string') {
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

  if (typeof accessToken !== 'string' || accessToken.length === 0) {
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
