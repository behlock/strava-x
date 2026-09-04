import { randomBytes } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'

import { getAppUrl, setOAuthStateCookie } from '@/lib/server-config'

export const runtime = 'nodejs'

// GET /api/auth/strava/start
// Server-managed OAuth kickoff: generates a fresh `state`, stashes it in an
// httpOnly cookie, and 302s the user to Strava. The client never sees the
// state value — the callback validates it against the cookie. This keeps the
// CSRF guarantee from depending on browser sessionStorage being reachable.
export async function GET(req: NextRequest) {
  const origin = getAppUrl(req)
  const requestUrl = new URL(req.url)

  // The state cookie is host-scoped, but redirect_uri always points at the
  // canonical origin (Strava only accepts one callback domain). If the user
  // started from another host — a per-deployment *.vercel.app URL, say — the
  // callback would land on the canonical host without the cookie and fail
  // with invalid_state. So bounce to the canonical host first, before any
  // cookie is set. Hosts are compared (not full origins) so a proxy that
  // reports a different scheme can't make this redirect to itself forever;
  // once we're on the canonical host the hosts match and we fall through.
  if (requestUrl.host.toLowerCase() !== new URL(origin).host.toLowerCase()) {
    return NextResponse.redirect(`${origin}${requestUrl.pathname}${requestUrl.search}`)
  }

  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID
  if (!clientId) return NextResponse.redirect(`${origin}/?strava_error=server_not_configured`)

  const state = randomBytes(16).toString('hex')

  const url = new URL('https://www.strava.com/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', `${origin}/api/auth/strava/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('approval_prompt', 'auto')
  url.searchParams.set('scope', 'read,activity:read_all')
  url.searchParams.set('state', state)

  const res = NextResponse.redirect(url)
  setOAuthStateCookie(res, state)
  return res
}
