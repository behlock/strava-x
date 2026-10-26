import { randomBytes } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'

import { getAppUrl, setOAuthStateCookie } from '@/lib/server-config'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const origin = getAppUrl(req)
  const requestUrl = new URL(req.url)

  // Set the host-scoped state cookie on the callback host; comparing hosts avoids proxy scheme loops.
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
  url.searchParams.set('approval_prompt', 'force')
  url.searchParams.set('scope', 'read,activity:read')
  url.searchParams.set('state', state)

  const res = NextResponse.redirect(url)
  setOAuthStateCookie(res, state)
  return res
}
