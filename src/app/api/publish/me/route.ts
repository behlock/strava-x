import { type NextRequest, NextResponse } from 'next/server'

import { authenticateAthlete, enforceRateLimit, isAccessToken, jsonError, readJsonBody } from '@/lib/api'
import { findByAthleteId } from '@/lib/db'

export const runtime = 'nodejs'

interface MeBody {
  accessToken?: unknown
}

// POST /api/publish/me — body: { accessToken }.
// Returns { slug: string | null }. Used by the client to rehydrate the
// "your current slug" state when the user reconnects to Strava from a
// different browser or after clearing localStorage.
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'publish-me', { windowMs: 60_000, max: 30 })
  if (limited) return limited

  const body = await readJsonBody<MeBody>(req)
  if (!body) return jsonError('invalid_json')
  if (!isAccessToken(body.accessToken)) return jsonError('missing_access_token')

  const auth = await authenticateAthlete(body.accessToken)
  if (!auth.ok) return jsonError(auth.error, auth.status)

  const existing = await findByAthleteId(auth.athlete.athleteId)
  return NextResponse.json({ slug: existing?.slug ?? null })
}
