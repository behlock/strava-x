import { type NextRequest, NextResponse } from 'next/server'

import { isSameOriginRequest, jsonError } from '@/lib/api'
import { clearSessionCookies } from '@/lib/server-config'

export const runtime = 'nodejs'

// POST /api/auth/strava/logout
// Clears the session cookies. Doesn't call Strava's deauthorize endpoint —
// the user may want to reconnect without going through approval again.
//
// Same-origin only: the session cookies are SameSite=Lax, which doesn't stop
// a cross-site top-level form POST, so without this check any page could log
// the user out.
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return jsonError('forbidden', 403)

  const res = NextResponse.json({ ok: true })
  clearSessionCookies(res)
  return res
}
