import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

import { getAppUrl, isProduction, STRAVA_OAUTH_STATE_COOKIE } from '@/lib/server-config'

export const runtime = 'nodejs'

// Server-managed OAuth kickoff: generates a fresh `state`, stashes it in an
// httpOnly cookie, and 302s the user to Strava. The client never sees the
// state value — the callback validates it against the cookie. This keeps the
// CSRF guarantee from depending on browser sessionStorage being reachable.
export async function GET(req: NextRequest) {
  const origin = getAppUrl(req)
  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID
  if (!clientId) {
    return NextResponse.redirect(`${origin}/?strava_error=server_not_configured`)
  }

  const state = randomBytes(16).toString('hex')
  const redirectUri = `${origin}/api/auth/strava/callback`

  const url = new URL('https://www.strava.com/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('approval_prompt', 'auto')
  url.searchParams.set('scope', 'read,activity:read_all')
  url.searchParams.set('state', state)

  const res = NextResponse.redirect(url.toString())
  res.cookies.set(STRAVA_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProduction(),
    // Must be 'lax' (not 'strict') so the cookie is sent when Strava bounces
    // the user back via top-level GET navigation.
    sameSite: 'lax',
    path: '/api/auth/strava',
    maxAge: 60 * 10,
  })
  return res
}
