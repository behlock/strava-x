import { digest, signProof } from '@/lib/sharing-proof'
import type { NextRequest, NextResponse } from 'next/server'

import {
  SESSION_COOKIE_MAX_AGE,
  STRAVA_CONNECTED_COOKIE,
  STRAVA_OAUTH_STATE_COOKIE,
  STRAVA_REFRESH_COOKIE,
  STRAVA_ROUTE_GRANT_COOKIE,
} from '@/lib/cookies'

// OAuth must start on the callback origin so its host-scoped state cookie survives.
export function getAppUrl(req?: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) return envUrl.replace(/\/$/, '')
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) return `https://${vercelUrl}`
  if (req) return new URL(req.url).origin
  throw new Error('app_url_not_configured')
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

export function getStravaCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

const OAUTH_STATE_COOKIE_PATH = '/api/auth/strava'

export function setOAuthStateCookie(res: NextResponse, state: string): void {
  res.cookies.set(STRAVA_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProduction(),
    // Allow Strava's top-level GET callback to carry the state cookie.
    sameSite: 'lax',
    path: OAUTH_STATE_COOKIE_PATH,
    maxAge: 60 * 10,
  })
}

export function clearOAuthStateCookie(res: NextResponse): void {
  res.cookies.set(STRAVA_OAUTH_STATE_COOKIE, '', { path: OAUTH_STATE_COOKIE_PATH, maxAge: 0 })
}

export function setSessionCookies(res: NextResponse, refreshToken: string, routesVerified = false): void {
  const base = { secure: isProduction(), sameSite: 'lax', path: '/', maxAge: SESSION_COOKIE_MAX_AGE } as const
  res.cookies.set(STRAVA_REFRESH_COOKIE, refreshToken, { ...base, httpOnly: true })
  res.cookies.set(STRAVA_CONNECTED_COOKIE, '1', base)
  res.cookies.set(
    STRAVA_ROUTE_GRANT_COOKIE,
    routesVerified
      ? signProof('refresh-grant', { token: digest(refreshToken) }, Date.now() + SESSION_COOKIE_MAX_AGE * 1000)
      : '',
    { ...base, httpOnly: true, maxAge: routesVerified ? SESSION_COOKIE_MAX_AGE : 0 },
  )
}

export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(STRAVA_ROUTE_GRANT_COOKIE, '', { path: '/', maxAge: 0 })
  res.cookies.set(STRAVA_REFRESH_COOKIE, '', { path: '/', maxAge: 0 })
  res.cookies.set(STRAVA_CONNECTED_COOKIE, '', { path: '/', maxAge: 0 })
}
