// Server-side verification: exchanges a Strava access token for the owning
// athlete's id by calling /api/v3/athlete. Used by the publish endpoints to
// prove that a publisher actually controls the athlete they claim.

interface StravaAthleteResponse {
  id: number
  firstname?: string
  lastname?: string
  username?: string
}

export interface VerifiedAthlete {
  athleteId: number
  displayName: string | null
}

export class StravaAuthError extends Error {
  constructor(public readonly reason: 'unauthorized' | 'network' | 'malformed') {
    super(`strava_auth_${reason}`)
  }
}

// Short-lived per-instance cache. Strava's athlete endpoint is rate-limited
// (100 reads / 15min, 1000 / day) and the publish dialog can trigger several
// token verifications in quick succession (slug-availability checks on every
// keystroke). On Fluid Compute this cache survives across invocations on the
// same instance, which is enough to absorb those bursts.
const VERIFY_TTL_MS = 5 * 60 * 1000
const verifyCache = new Map<string, { athlete: VerifiedAthlete; expiresAt: number }>()

export async function verifyStravaToken(accessToken: string): Promise<VerifiedAthlete> {
  const now = Date.now()
  const cached = verifyCache.get(accessToken)
  if (cached && cached.expiresAt > now) return cached.athlete

  let res: Response
  try {
    res = await fetch('https://www.strava.com/api/v3/athlete', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
  } catch {
    throw new StravaAuthError('network')
  }

  if (res.status === 401 || res.status === 403) {
    verifyCache.delete(accessToken)
    throw new StravaAuthError('unauthorized')
  }
  if (!res.ok) throw new StravaAuthError('network')

  let body: StravaAthleteResponse
  try {
    body = (await res.json()) as StravaAthleteResponse
  } catch {
    throw new StravaAuthError('malformed')
  }

  if (typeof body.id !== 'number') throw new StravaAuthError('malformed')

  const displayName = [body.firstname, body.lastname].filter(Boolean).join(' ').trim() || body.username?.trim() || null

  const athlete: VerifiedAthlete = { athleteId: body.id, displayName }
  verifyCache.set(accessToken, { athlete, expiresAt: now + VERIFY_TTL_MS })
  return athlete
}
