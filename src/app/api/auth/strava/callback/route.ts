import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

import {
  getAppUrl,
  isProduction,
  STRAVA_CONNECTED_COOKIE,
  STRAVA_OAUTH_STATE_COOKIE,
  STRAVA_REFRESH_COOKIE,
} from '@/lib/server-config'

// Constant-time string equality. timingSafeEqual throws when buffer lengths
// differ, so the length guard runs first.
function safeEqual(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export const runtime = 'nodejs'

// Strava refresh tokens don't carry an explicit expiry — pin a year.
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function clearStateCookie(res: NextResponse) {
  res.cookies.set(STRAVA_OAUTH_STATE_COOKIE, '', { path: '/api/auth/strava', maxAge: 0 })
}

function failRedirect(origin: string, code: string) {
  const res = NextResponse.redirect(`${origin}/?strava_error=${encodeURIComponent(code)}`)
  clearStateCookie(res)
  return res
}

export async function GET(req: NextRequest) {
  const origin = getAppUrl(req)
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const scope = searchParams.get('scope') ?? ''
  const state = searchParams.get('state') ?? ''

  if (error || !code) {
    return failRedirect(origin, error ?? 'missing_code')
  }

  // Server-side CSRF: the state from Strava must match what we stashed in the
  // cookie before bouncing the user there.
  const expectedState = req.cookies.get(STRAVA_OAUTH_STATE_COOKIE)?.value ?? ''
  if (!safeEqual(state, expectedState)) {
    return failRedirect(origin, 'invalid_state')
  }

  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return failRedirect(origin, 'server_not_configured')
  }

  const requiredScopes = ['read', 'activity:read_all']
  const granted = scope.split(',')
  if (!requiredScopes.every((s) => granted.includes(s))) {
    return failRedirect(origin, 'missing_scope')
  }

  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '')
    console.error('[strava/callback] token exchange failed', tokenRes.status, body)
    return failRedirect(origin, 'token_exchange_failed')
  }

  const token = (await tokenRes.json()) as {
    access_token?: unknown
    refresh_token?: unknown
    expires_at?: unknown
    athlete?: { id?: unknown }
  }

  if (
    typeof token.access_token !== 'string' ||
    typeof token.refresh_token !== 'string' ||
    typeof token.expires_at !== 'number'
  ) {
    console.error('[strava/callback] invalid token response shape')
    return failRedirect(origin, 'invalid_token_response')
  }

  // The refresh_token lives in an httpOnly cookie — JS (including any XSS)
  // cannot read it. The client mints a short-lived access token by POSTing
  // to /api/auth/strava/refresh, which reads this cookie. No tokens land in
  // the URL fragment, history, or referer headers.
  const res = NextResponse.redirect(`${origin}/?just_connected=1`)
  res.cookies.set(STRAVA_REFRESH_COOKIE, token.refresh_token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  })
  // Non-httpOnly flag the client reads to know "a session exists" without
  // ever touching the refresh token. Value carries no secret.
  res.cookies.set(STRAVA_CONNECTED_COOKIE, '1', {
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  })
  clearStateCookie(res)
  return res
}
