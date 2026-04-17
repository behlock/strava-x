import { NextRequest, NextResponse } from 'next/server'

import { findByAthleteId } from '@/lib/db'
import { verifyStravaToken, StravaAuthError } from '@/lib/strava-verify'

export const runtime = 'nodejs'

interface MeBody {
  accessToken?: unknown
}

// POST /api/publish/me — body: { accessToken }.
// Returns { slug: string | null }. Used by the client to rehydrate the
// "your current slug" state when the user reconnects to Strava from a
// different browser or after clearing localStorage.
export async function POST(req: NextRequest) {
  let body: MeBody
  try {
    body = (await req.json()) as MeBody
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { accessToken } = body
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    return NextResponse.json({ error: 'missing_access_token' }, { status: 400 })
  }

  let athleteId: number
  try {
    athleteId = (await verifyStravaToken(accessToken)).athleteId
  } catch (e) {
    if (e instanceof StravaAuthError && e.reason === 'unauthorized') {
      return NextResponse.json({ error: 'strava_auth_failed' }, { status: 401 })
    }
    return NextResponse.json({ error: 'strava_verify_failed' }, { status: 502 })
  }

  const existing = await findByAthleteId(athleteId)
  return NextResponse.json({ slug: existing?.slug ?? null })
}
