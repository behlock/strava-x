import { type NextRequest, NextResponse } from 'next/server'

import { clientKey, rateLimit, type RateLimitOptions } from '@/lib/rate-limit'
import { getAppUrl } from '@/lib/server-config'
import { StravaAuthError, type VerifiedAthlete, verifyStravaToken } from '@/lib/strava-verify'

export function jsonError(error: string, status = 400, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** Returns a 429 response when the caller is over the limit, otherwise `null`. */
export function enforceRateLimit(req: NextRequest, prefix: string, opts: RateLimitOptions): NextResponse | null {
  const result = rateLimit(clientKey(req, prefix), opts)
  if (result.ok) return null
  return NextResponse.json(
    { error: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
  )
}

// CSRF guard for cookie-authenticated mutations, including browsers without Fetch Metadata.
export function isSameOriginRequest(req: NextRequest): boolean {
  const site = req.headers.get('sec-fetch-site')
  if (site === 'same-origin' || site === 'none') return true
  const origin = req.headers.get('origin')
  if (!origin) return false
  return origin === new URL(req.url).origin || origin === getAppUrl(req)
}

/** Returns null when the byte limit is exceeded, including for chunked requests. */
export async function readBoundedBody(req: NextRequest, limit: number): Promise<Buffer | null> {
  const reader = req.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

/** Parses a bounded JSON body; null means missing, oversized, or malformed. */
export async function readJsonBody<T>(req: NextRequest): Promise<T | null> {
  try {
    const body = await readBoundedBody(req, 64 * 1024)
    return body ? (JSON.parse(body.toString('utf8')) as T) : null
  } catch {
    return null
  }
}

// Strava access tokens are 40-char hex strings today; the cap only bounds
// what we're willing to forward upstream.
const MAX_ACCESS_TOKEN_LENGTH = 200

export function isAccessToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ACCESS_TOKEN_LENGTH
}

export type AthleteAuthResult =
  | { ok: true; athlete: VerifiedAthlete }
  | { ok: false; error: 'strava_auth_failed' | 'strava_verify_failed'; status: 401 | 502 }

/** Resolves the athlete behind an access token, or the error the route should surface. */
export async function authenticateAthlete(accessToken: string): Promise<AthleteAuthResult> {
  try {
    return { ok: true, athlete: await verifyStravaToken(accessToken) }
  } catch (e) {
    if (e instanceof StravaAuthError && e.reason === 'unauthorized') {
      return { ok: false, error: 'strava_auth_failed', status: 401 }
    }
    return { ok: false, error: 'strava_verify_failed', status: 502 }
  }
}
