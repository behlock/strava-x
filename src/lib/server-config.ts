import type { NextRequest, NextResponse } from 'next/server'

import {
  SESSION_COOKIE_MAX_AGE,
  STRAVA_CONNECTED_COOKIE,
  STRAVA_OAUTH_STATE_COOKIE,
  STRAVA_REFRESH_COOKIE,
} from '@/lib/cookies'

// Resolves the app's canonical origin. Prefers an explicit env var, then on
// production Vercel deployments the project's stable production domain (so
// Strava's single-registered-callback-domain rule is honored even when the
// user lands on a per-deployment *.vercel.app URL), then the per-deployment
// VERCEL_URL, then the incoming request's origin.
//
// Note this can differ from the host the request actually arrived on. The
// OAuth state cookie is host-scoped, so /api/auth/strava/start redirects to
// this origin before setting it — otherwise the callback (which Strava always
// sends to the canonical origin) would never see the cookie.
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
    // Must be 'lax' (not 'strict') so the cookie is sent when Strava bounces
    // the user back via top-level GET navigation.
    sameSite: 'lax',
    path: OAUTH_STATE_COOKIE_PATH,
    maxAge: 60 * 10,
  })
}

export function clearOAuthStateCookie(res: NextResponse): void {
  res.cookies.set(STRAVA_OAUTH_STATE_COOKIE, '', { path: OAUTH_STATE_COOKIE_PATH, maxAge: 0 })
}

// Sets the httpOnly refresh cookie plus the non-httpOnly "connected" flag.
// The client reads the flag to know a session exists without ever touching
// the refresh token.
export function setSessionCookies(res: NextResponse, refreshToken: string): void {
  const base = { secure: isProduction(), sameSite: 'lax', path: '/', maxAge: SESSION_COOKIE_MAX_AGE } as const
  res.cookies.set(STRAVA_REFRESH_COOKIE, refreshToken, { ...base, httpOnly: true })
  res.cookies.set(STRAVA_CONNECTED_COOKIE, '1', base)
}

export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(STRAVA_REFRESH_COOKIE, '', { path: '/', maxAge: 0 })
  res.cookies.set(STRAVA_CONNECTED_COOKIE, '', { path: '/', maxAge: 0 })
}
