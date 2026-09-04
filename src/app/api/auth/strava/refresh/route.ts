import { createHash } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'

import { enforceRateLimit, jsonError } from '@/lib/api'
import { STRAVA_REFRESH_COOKIE } from '@/lib/cookies'
import { clearSessionCookies, getStravaCredentials, setSessionCookies } from '@/lib/server-config'

export const runtime = 'nodejs'

const MAX_REFRESH_TOKEN_LENGTH = 200

// Short-lived per-instance memo of "we just rotated this refresh_token".
// Lets a concurrent /refresh call that races with another tab serve the
// already-minted access_token instead of clearing the session. Keyed on
// sha256(oldRefreshToken) so heap snapshots don't expose live credentials.
const ROTATION_CACHE_TTL_MS = 30_000
const MAX_ROTATION_ENTRIES = 1000

interface RotationEntry {
  accessToken: string
  expiresAt: number
  cachedUntil: number
}

const rotationCache = new Map<string, RotationEntry>()

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function recordRotation(oldRefreshToken: string, accessToken: string, expiresAt: number): void {
  const now = Date.now()
  if (rotationCache.size >= MAX_ROTATION_ENTRIES) {
    for (const [key, entry] of rotationCache) {
      if (entry.cachedUntil < now) rotationCache.delete(key)
      if (rotationCache.size < MAX_ROTATION_ENTRIES / 2) break
    }
  }
  rotationCache.set(hashToken(oldRefreshToken), { accessToken, expiresAt, cachedUntil: now + ROTATION_CACHE_TTL_MS })
}

function recoverRotation(oldRefreshToken: string): Pick<RotationEntry, 'accessToken' | 'expiresAt'> | null {
  const key = hashToken(oldRefreshToken)
  const entry = rotationCache.get(key)
  if (!entry) return null
  if (entry.cachedUntil < Date.now()) {
    rotationCache.delete(key)
    return null
  }
  return { accessToken: entry.accessToken, expiresAt: entry.expiresAt }
}

// Only these statuses mean Strava rejected the refresh_token itself (revoked,
// already rotated, malformed). Anything else — 429, 5xx, a network failure —
// says nothing about the token, so the session must be left intact.
function isTokenRejected(status: number): boolean {
  return status === 400 || status === 401
}

// POST /api/auth/strava/refresh
// Mints a fresh access_token for the caller using the refresh_token in their
// httpOnly cookie. The refresh_token never crosses the JS boundary — the
// response body only contains the short-lived access_token and its expiry.
// Strava rotates the refresh_token on every successful refresh, so we update
// the cookie atomically with the response.
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'strava-refresh', { windowMs: 60_000, max: 20 })
  if (limited) return limited

  const refreshToken = req.cookies.get(STRAVA_REFRESH_COOKIE)?.value
  if (!refreshToken || refreshToken.length > MAX_REFRESH_TOKEN_LENGTH) {
    return jsonError('not_authenticated', 401)
  }

  const credentials = getStravaCredentials()
  if (!credentials) return jsonError('server_not_configured', 500)

  let stravaRes: Response
  try {
    stravaRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
  } catch (e) {
    console.error('[strava/refresh] token request failed', e)
    const recovered = recoverRotation(refreshToken)
    if (recovered) {
      return NextResponse.json({ access_token: recovered.accessToken, expires_at: recovered.expiresAt })
    }
    return jsonError('strava_unavailable', 503)
  }

  if (!stravaRes.ok) {
    // Multi-tab rotation race: another concurrent /refresh on this instance
    // already rotated this same refresh_token. Serve the access_token from
    // that rotation instead of clearing the session. Across instances we
    // can't detect the race and fall through to the genuine-failure path.
    const recovered = recoverRotation(refreshToken)
    if (recovered) {
      return NextResponse.json({ access_token: recovered.accessToken, expires_at: recovered.expiresAt })
    }
    if (!isTokenRejected(stravaRes.status)) {
      // Strava is rate limiting or down. Keep the cookies so the client can
      // retry later instead of being logged out by a transient outage.
      console.error('[strava/refresh] strava unavailable', stravaRes.status)
      return jsonError('strava_unavailable', 502)
    }
    // Strava refused the token — most likely the user revoked access. Clear
    // cookies so the client treats the session as ended rather than retrying
    // forever.
    const failed = jsonError('refresh_failed', 401)
    clearSessionCookies(failed)
    return failed
  }

  const data = (await stravaRes.json()) as { access_token?: unknown; refresh_token?: unknown; expires_at?: unknown }
  if (
    typeof data.access_token !== 'string' ||
    typeof data.refresh_token !== 'string' ||
    typeof data.expires_at !== 'number'
  ) {
    return jsonError('invalid_token_response', 502)
  }

  recordRotation(refreshToken, data.access_token, data.expires_at)

  const res = NextResponse.json({ access_token: data.access_token, expires_at: data.expires_at })
  setSessionCookies(res, data.refresh_token)
  return res
}
