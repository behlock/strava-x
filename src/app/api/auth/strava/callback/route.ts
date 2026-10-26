import { isAccessToken } from '@/lib/api'
import { safeRouteScope } from '@/lib/sharing-proof'
import { timingSafeEqual } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'

import { STRAVA_OAUTH_STATE_COOKIE } from '@/lib/cookies'
import { clearOAuthStateCookie, getAppUrl, getStravaCredentials, setSessionCookies } from '@/lib/server-config'

export const runtime = 'nodejs'

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a),
    right = Buffer.from(b)
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right)
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
  const state = searchParams.get('state') ?? ''

  if (error || !code) return failRedirect(origin, error ?? 'missing_code')

  // Server-side CSRF: the state from Strava must match what we stashed in the
  // cookie before bouncing the user there.
  const expectedState = req.cookies.get(STRAVA_OAUTH_STATE_COOKIE)?.value ?? ''
  if (!safeEqual(state, expectedState)) return failRedirect(origin, 'invalid_state')

  const credentials = getStravaCredentials()
  if (!credentials) return failRedirect(origin, 'server_not_configured')

  let tokenRes: Response
  try {
    tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    })
  } catch {
    return failRedirect(origin, 'token_exchange_failed')
  }

  if (!tokenRes.ok) {
    return failRedirect(origin, 'token_exchange_failed')
  }

  const token = (await tokenRes.json().catch(() => null)) as { refresh_token?: unknown; scope?: unknown } | null
  if (!token || !isAccessToken(token.refresh_token)) {
    console.error('[strava/callback] invalid token response shape')
    return failRedirect(origin, 'invalid_token_response')
  }

  // Only the refresh_token is kept, in an httpOnly cookie. The client mints
  // short-lived access tokens by POSTing to /api/auth/strava/refresh, so no
  // token ever lands in the URL, history, or referer headers.
  const res = NextResponse.redirect(`${origin}/`)
  setSessionCookies(res, token.refresh_token, safeRouteScope(token.scope))
  clearOAuthStateCookie(res)
  return res
}
