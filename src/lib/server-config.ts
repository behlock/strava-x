import type { NextRequest } from 'next/server'

// Resolves the app's canonical origin. Prefers an explicit env var, then on
// production Vercel deployments the project's stable production domain (so
// Strava's single-registered-callback-domain rule is honored even when the
// user lands on a per-deployment *.vercel.app URL), then the per-deployment
// VERCEL_URL, then the incoming request's origin.
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

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

// The long-lived Strava refresh_token. httpOnly so JS (including any XSS)
// cannot read it; the access_token can be reminted as long as this cookie
// is present.
export const STRAVA_REFRESH_COOKIE = 'strava_rt'

// Non-httpOnly flag the client uses to know "a session exists". Carries no
// secret — the value is always '1'.
export const STRAVA_CONNECTED_COOKIE = 'strava_connected'

// httpOnly cookie that holds the OAuth `state` value for the duration of the
// authorize round-trip. Compared server-side in the callback to defeat CSRF.
export const STRAVA_OAUTH_STATE_COOKIE = 'strava_oauth_state'
