import { type NextRequest, NextResponse } from 'next/server'

import { isSameOriginRequest, jsonError } from '@/lib/api'
import { clearSessionCookies } from '@/lib/server-config'

export const runtime = 'nodejs'

// End this browser session without revoking Strava authorization.
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return jsonError('forbidden', 403)

  const res = NextResponse.json({ ok: true })
  clearSessionCookies(res)
  return res
}
