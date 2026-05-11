// Server-side verification: exchanges a Strava access token for the owning
// athlete's id by calling /api/v3/athlete. Used by the publish endpoints to
// prove that a publisher actually controls the athlete they claim.

import { createHash } from 'crypto'

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
//
// Keys are sha256 hashes of the access token, not the token itself — a heap
// snapshot of this process should not leak live bearer credentials. LRU
// eviction caps memory so unbounded distinct tokens can't grow the cache.
const VERIFY_TTL_MS = 5 * 60 * 1000
const MAX_CACHE_SIZE = 500
const verifyCache = new Map<string, { athlete: VerifiedAthlete; expiresAt: number }>()

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function getCached(tokenHash: string): VerifiedAthlete | null {
  const cached = verifyCache.get(tokenHash)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    verifyCache.delete(tokenHash)
    return null
  }
  // Refresh recency for LRU.
  verifyCache.delete(tokenHash)
  verifyCache.set(tokenHash, cached)
  return cached.athlete
}

function setCached(tokenHash: string, athlete: VerifiedAthlete) {
  if (verifyCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = verifyCache.keys().next().value
    if (oldestKey !== undefined) verifyCache.delete(oldestKey)
  }
  verifyCache.set(tokenHash, { athlete, expiresAt: Date.now() + VERIFY_TTL_MS })
}

export async function verifyStravaToken(accessToken: string): Promise<VerifiedAthlete> {
  const tokenHash = hashToken(accessToken)
  const cached = getCached(tokenHash)
  if (cached) return cached

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

  if (typeof body.id !== 'number') throw new StravaAuthError('malformed')

  const displayName = [body.firstname, body.lastname].filter(Boolean).join(' ').trim() || body.username?.trim() || null

  const athlete: VerifiedAthlete = { athleteId: body.id, displayName }
  setCached(tokenHash, athlete)
  return athlete
}
