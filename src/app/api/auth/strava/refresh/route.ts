import { type NextRequest, NextResponse } from 'next/server'
import { enforceRateLimit, isAccessToken, isSameOriginRequest, jsonError } from '@/lib/api'
import { STRAVA_REFRESH_COOKIE } from '@/lib/cookies'
import { clearSessionCookies, getStravaCredentials, setSessionCookies } from '@/lib/server-config'
import { digest } from '@/lib/sharing-proof'
import { TtlCache } from '@/lib/ttl-cache'

export const runtime = 'nodejs'
interface Token {
  access_token: string
  refresh_token: string
  expires_at: number
}
type Result = { token: Token } | { error: string; status: number }
// Coalesce rotation races and give every waiter the same refreshed cookies.
const rotations = new TtlCache<Promise<Result>>(1000, 30_000)

async function refresh(refreshToken: string): Promise<Result> {
  const credentials = getStravaCredentials()
  if (!credentials) return { error: 'server_not_configured', status: 500 }
  try {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    if (!res.ok)
      return res.status === 400 || res.status === 401
        ? { error: 'refresh_failed', status: 401 }
        : { error: 'strava_unavailable', status: 502 }
    const data = await res.json()
    if (
      !data ||
      !isAccessToken(data.access_token) ||
      !isAccessToken(data.refresh_token) ||
      !Number.isFinite(data.expires_at) ||
      data.expires_at * 1000 <= Date.now()
    )
      return { error: 'invalid_token_response', status: 502 }
    return {
      token: {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
      },
    }
  } catch {
    return { error: 'strava_unavailable', status: 503 }
  }
}

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return jsonError('forbidden', 403)
  const limited = enforceRateLimit(req, 'strava-refresh', { windowMs: 60_000, max: 20 })
  if (limited) return limited
  const refreshToken = req.cookies.get(STRAVA_REFRESH_COOKIE)?.value
  if (!isAccessToken(refreshToken)) {
    const response = jsonError('not_authenticated', 401)
    clearSessionCookies(response)
    return response
  }
  const key = digest(refreshToken)
  let pending = rotations.get(key)
  if (!pending) {
    pending = refresh(refreshToken)
    rotations.set(key, pending)
  }
  const result = await pending
  if ('error' in result) {
    rotations.delete(key)
    const response = jsonError(result.error, result.status)
    if (result.status === 401) clearSessionCookies(response)
    return response
  }
  const { access_token, expires_at, refresh_token } = result.token
  const response = NextResponse.json({ access_token, expires_at }, { headers: { 'Cache-Control': 'no-store' } })
  setSessionCookies(response, refresh_token)
  return response
}
