'use client'

import { useRouter, useSearchParams } from 'next/navigation'

import { HeaderChip } from './header-bar'

// Codes come from /api/auth/strava/callback's failure redirects.
const MESSAGES: Record<string, string> = {
  access_denied: 'strava access denied',
  invalid_state: 'sign-in expired, try again',
  missing_scope: 'activity permission required',
  missing_code: 'strava sign-in failed',
  token_exchange_failed: 'strava sign-in failed',
  invalid_token_response: 'strava sign-in failed',
  server_not_configured: 'strava not configured',
}

/**
 * Surfaces the `?strava_error=` code set by the OAuth callback. Reads search
 * params, so it must be rendered inside a Suspense boundary.
 */
export function StravaAuthError() {
  const code = useSearchParams().get('strava_error')
  const router = useRouter()
  if (!code) return null

  const message = MESSAGES[code] ?? 'strava sign-in failed'
  return (
    <HeaderChip
      variant="text"
      tooltip={`${message} (click to dismiss)`}
      onClick={() => router.replace('/')}
      aria-label={`${message}. Dismiss`}
      className="text-red-500 dark:text-red-400"
    >
      [!]<span className="ml-1 hidden md:inline">{message}</span>
    </HeaderChip>
  )
}
