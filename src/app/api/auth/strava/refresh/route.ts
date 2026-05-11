import { NextRequest, NextResponse } from 'next/server'

import { isProduction, STRAVA_CONNECTED_COOKIE, STRAVA_REFRESH_COOKIE } from '@/lib/server-config'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

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
    // Strava refused — most likely the user revoked access or the refresh
    // token was already rotated by a parallel request. Clear cookies so the
    // client treats the session as ended rather than retrying forever.
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
