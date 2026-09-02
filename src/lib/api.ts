// Helpers shared by the route handlers under src/app/api.

import { type NextRequest, NextResponse } from 'next/server'

import { clientKey, rateLimit, type RateLimitOptions } from '@/lib/rate-limit'
import { StravaAuthError, type VerifiedAthlete, verifyStravaToken } from '@/lib/strava-verify'

export function jsonError(error: string, status = 400, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error, ...extra }, { status })
}

/** Returns a 429 response when the caller is over the limit, otherwise `null`. */
export function enforceRateLimit(req: NextRequest, prefix: string, opts: RateLimitOptions): NextResponse | null {
  const result = rateLimit(clientKey(req, prefix), opts)
  if (result.ok) return null
  return NextResponse.json(
    { error: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
  )
}

/** Parses a JSON body, returning `null` when it is missing or malformed. */
export async function readJsonBody<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T
  } catch {
    return null
  }
}

// Strava access tokens are 40-char hex strings today; the cap only bounds
// what we're willing to forward upstream.
const MAX_ACCESS_TOKEN_LENGTH = 200

export function isAccessToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ACCESS_TOKEN_LENGTH
}

export type AthleteAuthResult =
  | { ok: true; athlete: VerifiedAthlete }
  | { ok: false; error: 'strava_auth_failed' | 'strava_verify_failed'; status: 401 | 502 }

/** Resolves the athlete behind an access token, or the error the route should surface. */
export async function authenticateAthlete(accessToken: string): Promise<AthleteAuthResult> {
  try {
    return { ok: true, athlete: await verifyStravaToken(accessToken) }
  } catch (e) {
    if (e instanceof StravaAuthError && e.reason === 'unauthorized') {
      return { ok: false, error: 'strava_auth_failed', status: 401 }
    }
    return { ok: false, error: 'strava_verify_failed', status: 502 }
  }
}
