import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { refresh_token } = await req.json().catch(() => ({ refresh_token: null }))
  if (!refresh_token || typeof refresh_token !== 'string') {
    return NextResponse.json({ error: 'missing_refresh_token' }, { status: 400 })
  }

  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 })
  }

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'refresh_failed' }, { status: 401 })
  }

  const data = await res.json() as {
    access_token: string
    refresh_token: string
    expires_at: number
  }
  return NextResponse.json({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  })
}
