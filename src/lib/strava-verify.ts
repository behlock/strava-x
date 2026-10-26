// Server-side verification: exchanges a Strava access token for the owning
// athlete's id by calling /api/v3/athlete. Used by the publish endpoints to
// prove that a publisher actually controls the athlete they claim.

import { digest } from './sharing-proof'
import { TtlCache } from './ttl-cache'

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

// Hash keys avoid retaining bearer tokens; short TTL limits stale authorization.
const verifyCache = new TtlCache<VerifiedAthlete>(500, 5 * 60_000)

export async function verifyStravaToken(accessToken: string): Promise<VerifiedAthlete> {
  const tokenHash = digest(accessToken)
  const cached = verifyCache.get(tokenHash)
  if (cached) return cached

  let res: Response
  try {
    res = await fetch('https://www.strava.com/api/v3/athlete', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new StravaAuthError('network')
  }

  if (res.status === 401 || res.status === 403) {
    verifyCache.delete(tokenHash)
    throw new StravaAuthError('unauthorized')
  }
  if (!res.ok) throw new StravaAuthError('network')

  let body: StravaAthleteResponse
  try {
    body = (await res.json()) as StravaAthleteResponse
  } catch {
    throw new StravaAuthError('malformed')
  }

  if (!body || !Number.isSafeInteger(body.id) || body.id <= 0) throw new StravaAuthError('malformed')

  const displayName =
    [body.firstname, body.lastname]
      .filter((value) => typeof value === 'string')
      .join(' ')
      .trim()
      .slice(0, 100) || (typeof body.username === 'string' ? body.username.trim().slice(0, 100) : null)

  const athlete: VerifiedAthlete = { athleteId: body.id, displayName }
  verifyCache.set(tokenHash, athlete)
  return athlete
}
