'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Cookie set by /api/auth/strava/callback alongside the httpOnly refresh
// cookie. Non-httpOnly so JS can see "a session exists"; carries no secret.
const CONNECTED_COOKIE_NAME = 'strava_connected'
const REFRESH_SKEW_SECONDS = 60

// Legacy keys we used to store tokens in. Cleared on mount so left-over
// access/refresh tokens stop sitting in localStorage where any script on this
// origin can read them.
const LEGACY_TOKEN_KEY = 'strava-x:tokens'

interface AccessToken {
  access_token: string
  expires_at: number
}

function hasConnectedCookie(): boolean {
  if (typeof document === 'undefined') return false
  // Match the explicit value '1' rather than the bare name= prefix so an empty
  // cookie (shouldn't happen — logout uses Max-Age=0 — but defensive) isn't
  // mistaken for an active session.
  return document.cookie.split(';').some((c) => c.trim() === `${CONNECTED_COOKIE_NAME}=1`)
}

function clearLegacyStorage() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(LEGACY_TOKEN_KEY)
    // Removed in the cookie migration; kept here so older clients don't
    // leak the value across sessions if they ever hit a downgraded build.
    window.sessionStorage.removeItem('strava-x:oauth_state')
  } catch {
    // ignore
  }
}

async function refreshFromServer(): Promise<AccessToken | null> {
  try {
    const res = await fetch('/api/auth/strava/refresh', {
      method: 'POST',
      credentials: 'same-origin',
    })
    if (!res.ok) return null
    const body = (await res.json()) as { access_token?: string; expires_at?: number }
    if (typeof body.access_token !== 'string' || typeof body.expires_at !== 'number') return null
    return { access_token: body.access_token, expires_at: body.expires_at }
  } catch {
    return null
  }
}

export interface UseStravaAuth {
  isConnected: boolean
  justConnected: boolean
  connect: () => void
  disconnect: () => void
  getAccessToken: () => Promise<string | null>
}

export function useStravaAuth(): UseStravaAuth {
  const [isConnected, setIsConnected] = useState(false)
  const [justConnected, setJustConnected] = useState(false)
  // Access token lives in JS memory only — not localStorage. On reload it's
  // reminted via the httpOnly refresh cookie. Bound to the refreshSkew window.
  const tokenRef = useRef<AccessToken | null>(null)
  const refreshInFlightRef = useRef<Promise<AccessToken | null> | null>(null)

  useEffect(() => {
    clearLegacyStorage()

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (url.searchParams.get('just_connected') === '1') {
        url.searchParams.delete('just_connected')
        const search = url.search
        window.history.replaceState(null, '', url.pathname + (search ? search : '') + url.hash)
        setJustConnected(true)
      }
    }

    if (hasConnectedCookie()) {
      setIsConnected(true)
    }
  }, [])

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return
    // Server-managed OAuth: /start sets the state cookie and 302s to Strava.
    window.location.href = '/api/auth/strava/start'
  }, [])

  const disconnect = useCallback(() => {
    void fetch('/api/auth/strava/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
    tokenRef.current = null
    setIsConnected(false)
    setJustConnected(false)
    clearLegacyStorage()
  }, [])

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const cached = tokenRef.current
    const now = Math.floor(Date.now() / 1000)
    if (cached && cached.expires_at > now + REFRESH_SKEW_SECONDS) {
      return cached.access_token
    }

    // Dedupe concurrent refresh calls — Strava rotates the refresh_token on
    // each successful refresh, so firing two in parallel invalidates the
    // second one.
    if (!refreshInFlightRef.current) {
      refreshInFlightRef.current = refreshFromServer().finally(() => {
        refreshInFlightRef.current = null
      })
    }

    const refreshed = await refreshInFlightRef.current
    if (refreshed) {
      tokenRef.current = refreshed
      setIsConnected(true)
      return refreshed.access_token
    }
    tokenRef.current = null
    setIsConnected(false)
    return null
  }, [])

  return {
    isConnected,
    justConnected,
    connect,
    disconnect,
    getAccessToken,
  }
}
