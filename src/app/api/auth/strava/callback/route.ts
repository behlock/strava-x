import { timingSafeEqual } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'

import { STRAVA_OAUTH_STATE_COOKIE } from '@/lib/cookies'
import { clearOAuthStateCookie, getAppUrl, getStravaCredentials, setSessionCookies } from '@/lib/server-config'

export const runtime = 'nodejs'

const REQUIRED_SCOPES = ['read', 'activity:read_all']

// Constant-time string equality. timingSafeEqual throws when buffer lengths
// differ, so the length guard runs first.
function safeEqual(a: string, b: string): boolean {
  if (a.length === 0 || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

function failRedirect(origin: string, code: string): NextResponse {
  const res = NextResponse.redirect(`${origin}/?strava_error=${encodeURIComponent(code)}`)
  clearOAuthStateCookie(res)
  return res
}

// GET /api/auth/strava/callback — where Strava sends the user after consent.
export async function GET(req: NextRequest) {
  const origin = getAppUrl(req)
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const scope = searchParams.get('scope') ?? ''
  const state = searchParams.get('state') ?? ''

  if (error || !code) return failRedirect(origin, error ?? 'missing_code')

  // Server-side CSRF: the state from Strava must match what we stashed in the
  // cookie before bouncing the user there.
  const expectedState = req.cookies.get(STRAVA_OAUTH_STATE_COOKIE)?.value ?? ''
  if (!safeEqual(state, expectedState)) return failRedirect(origin, 'invalid_state')

  const credentials = getStravaCredentials()
  if (!credentials) return failRedirect(origin, 'server_not_configured')

  const granted = scope.split(',')
  if (!REQUIRED_SCOPES.every((s) => granted.includes(s))) return failRedirect(origin, 'missing_scope')

  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '')
    console.error('[strava/callback] token exchange failed', tokenRes.status, body)
    return failRedirect(origin, 'token_exchange_failed')
  }

  const token = (await tokenRes.json()) as { refresh_token?: unknown }
  if (typeof token.refresh_token !== 'string') {
    console.error('[strava/callback] invalid token response shape')
    return failRedirect(origin, 'invalid_token_response')
  }

  // Only the refresh_token is kept, in an httpOnly cookie. The client mints
  // short-lived access tokens by POSTing to /api/auth/strava/refresh, so no
  // token ever lands in the URL, history, or referer headers.
  const res = NextResponse.redirect(`${origin}/`)
  setSessionCookies(res, token.refresh_token)
  clearOAuthStateCookie(res)
  return res
}
