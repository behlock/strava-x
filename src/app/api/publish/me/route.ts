import { type NextRequest, NextResponse } from 'next/server'

import { authenticateAthlete, enforceRateLimit, isAccessToken, jsonError, readJsonBody } from '@/lib/api'
import { ensureShare, shareState } from '@/lib/sharing-db'

export const runtime = 'nodejs'

interface MeBody {
  accessToken?: unknown
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'publish-me', { windowMs: 60_000, max: 30 })
  if (limited) return limited

  const body = await readJsonBody<MeBody>(req)
  if (!body) return jsonError('invalid_json')
  if (!isAccessToken(body.accessToken)) return jsonError('missing_access_token')

  const auth = await authenticateAthlete(body.accessToken)
  if (!auth.ok) return jsonError(auth.error, auth.status)

  try {
    const existing = await ensureShare(auth.athlete.athleteId)
    return NextResponse.json(shareState(existing), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return jsonError('sharing_unavailable', 503)
  }
}
