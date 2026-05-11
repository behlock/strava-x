import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

import { isProduction, STRAVA_CONNECTED_COOKIE, STRAVA_REFRESH_COOKIE } from '@/lib/server-config'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

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

function hashRefreshToken(t: string): string {
  return createHash('sha256').update(t).digest('hex')
}

function recordRotation(oldRefreshToken: string, accessToken: string, expiresAt: number) {
  const now = Date.now()
  if (rotationCache.size >= MAX_ROTATION_ENTRIES) {
    for (const [k, v] of rotationCache) {
      if (v.cachedUntil < now) rotationCache.delete(k)
      if (rotationCache.size < MAX_ROTATION_ENTRIES / 2) break
    }
  }
  rotationCache.set(hashRefreshToken(oldRefreshToken), {
    accessToken,
    expiresAt,
    cachedUntil: now + ROTATION_CACHE_TTL_MS,
  })
}

function recoverRotation(oldRefreshToken: string): { accessToken: string; expiresAt: number } | null {
  const key = hashRefreshToken(oldRefreshToken)
  const entry = rotationCache.get(key)
  if (!entry) return null
  if (entry.cachedUntil < Date.now()) {
    rotationCache.delete(key)
    return null
  }
  return { accessToken: entry.accessToken, expiresAt: entry.expiresAt }
}

// POST /api/auth/strava/refresh
// Mints a fresh access_token for the caller using the refresh_token in their
// httpOnly cookie. The refresh_token never crosses the JS boundary — the
// response body only contains the short-lived access_token and its expiry.
// Strava rotates the refresh_token on every successful refresh, so we update
// the cookie atomically with the response.
export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, 'strava-refresh'), { windowMs: 60_000, max: 20 })
  if (!rl.ok) return tooManyRequests(rl.retryAfterSeconds ?? 60)

  const refreshToken = req.cookies.get(STRAVA_REFRESH_COOKIE)?.value
  if (!refreshToken || refreshToken.length > 200) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 })
  }

  const stravaRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!stravaRes.ok) {
    // Multi-tab rotation race: another concurrent /refresh on this instance
    // already rotated this same refresh_token. Serve the access_token from
    // that rotation instead of clearing the session. Across instances we
    // can't detect the race and fall through to the genuine-failure path.
    const recovered = recoverRotation(refreshToken)
    if (recovered) {
      return NextResponse.json({ access_token: recovered.accessToken, expires_at: recovered.expiresAt })
    }
    // Strava refused — most likely the user revoked access. Clear cookies so
    // the client treats the session as ended rather than retrying forever.
    const failed = NextResponse.json({ error: 'refresh_failed' }, { status: 401 })
    failed.cookies.set(STRAVA_REFRESH_COOKIE, '', { path: '/', maxAge: 0 })
    failed.cookies.set(STRAVA_CONNECTED_COOKIE, '', { path: '/', maxAge: 0 })
    return failed
  }

  const data = (await stravaRes.json()) as {
    access_token?: unknown
    refresh_token?: unknown
    expires_at?: unknown
  }

  if (
    typeof data.access_token !== 'string' ||
    typeof data.refresh_token !== 'string' ||
    typeof data.expires_at !== 'number'
  ) {
    return NextResponse.json({ error: 'invalid_token_response' }, { status: 502 })
  }

  recordRotation(refreshToken, data.access_token, data.expires_at)

  const res = NextResponse.json({
    access_token: data.access_token,
    expires_at: data.expires_at,
  })
  res.cookies.set(STRAVA_REFRESH_COOKIE, data.refresh_token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  })
  return res
}
