import { NextResponse } from 'next/server'

import { STRAVA_CONNECTED_COOKIE, STRAVA_REFRESH_COOKIE } from '@/lib/server-config'

export const runtime = 'nodejs'

// POST /api/auth/strava/logout
// Clears the session cookies. Doesn't call Strava's deauthorize endpoint —
// the user may want to reconnect without going through approval again.
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(STRAVA_REFRESH_COOKIE, '', { path: '/', maxAge: 0 })
  res.cookies.set(STRAVA_CONNECTED_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
