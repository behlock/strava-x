import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const scope = searchParams.get('scope') ?? ''

  if (error || !code) {
    return NextResponse.redirect(`${origin}/?strava_error=${encodeURIComponent(error ?? 'missing_code')}`)
  }

  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?strava_error=server_not_configured`)
  }

  const requiredScopes = ['read', 'activity:read_all']
  const granted = scope.split(',')
  if (!requiredScopes.every((s) => granted.includes(s))) {
    return NextResponse.redirect(`${origin}/?strava_error=missing_scope`)
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
    const body = await tokenRes.text()
    console.error('[strava/callback] token exchange failed', tokenRes.status, body)
    return NextResponse.redirect(`${origin}/?strava_error=token_exchange_failed`)
  }

  const token = await tokenRes.json() as {
    access_token: string
    refresh_token: string
    expires_at: number
    athlete?: { id: number }
  }

  // Hand tokens back to the SPA via URL fragment (not sent to server on next navigation).
  const fragment = new URLSearchParams({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: String(token.expires_at),
    athlete_id: token.athlete?.id ? String(token.athlete.id) : '',
  }).toString()

  return NextResponse.redirect(`${origin}/#strava_auth=${fragment}`)
}
