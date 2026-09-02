import { NextResponse } from 'next/server'

import { clearSessionCookies } from '@/lib/server-config'

export const runtime = 'nodejs'

// POST /api/auth/strava/logout
// Clears the session cookies. Doesn't call Strava's deauthorize endpoint —
// the user may want to reconnect without going through approval again.
export async function POST() {
  const res = NextResponse.json({ ok: true })
  clearSessionCookies(res)
  return res
}
