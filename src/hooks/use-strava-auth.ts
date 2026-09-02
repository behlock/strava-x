'use client'

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

import { STRAVA_CONNECTED_COOKIE } from '@/lib/cookies'

const REFRESH_SKEW_SECONDS = 60

// Keys from before the cookie migration. Cleared on mount so left-over
// tokens stop sitting in storage where any script on this origin can read them.
const LEGACY_STORAGE_KEYS = ['strava-x:tokens', 'strava-x:oauth_state']

interface AccessToken {
  access_token: string
  expires_at: number
}

// --- Session store -----------------------------------------------------------
// "Connected" is derived from the non-httpOnly flag cookie the callback sets
// alongside the httpOnly refresh cookie. Cookies don't emit change events, so
// the code paths that change them call `notifySessionChange()`.

const sessionListeners = new Set<() => void>()

function subscribeSession(listener: () => void): () => void {
  sessionListeners.add(listener)
  // Re-check when the tab regains focus in case another tab logged out.
  window.addEventListener('focus', listener)
  return () => {
    sessionListeners.delete(listener)
    window.removeEventListener('focus', listener)
  }
}

function notifySessionChange(): void {
  for (const listener of sessionListeners) listener()
}

function hasConnectedCookie(): boolean {
  // Match the explicit value '1' rather than the bare name= prefix so an empty
  // cookie (shouldn't happen — logout uses Max-Age=0 — but defensive) isn't
  // mistaken for an active session.
  return document.cookie.split(';').some((c) => c.trim() === `${STRAVA_CONNECTED_COOKIE}=1`)
}

const getServerSnapshot = () => false

function clearLegacyStorage(): void {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      window.localStorage.removeItem(key)
      window.sessionStorage.removeItem(key)
    }
  } catch {
    // ignore
  }
}

async function refreshFromServer(): Promise<AccessToken | null> {
  try {
    const res = await fetch('/api/auth/strava/refresh', { method: 'POST', credentials: 'same-origin' })
    if (!res.ok) return null
    const body = (await res.json()) as { access_token?: unknown; expires_at?: unknown }
    if (typeof body.access_token !== 'string' || typeof body.expires_at !== 'number') return null
    return { access_token: body.access_token, expires_at: body.expires_at }
  } catch {
    return null
  }
}

export interface UseStravaAuth {
  isConnected: boolean
  connect: () => void
  disconnect: () => void
  /** Resolves a valid access token, reminting via the refresh cookie when needed; `null` when the session is gone. */
  getAccessToken: () => Promise<string | null>
}

export function useStravaAuth(): UseStravaAuth {
  const isConnected = useSyncExternalStore(subscribeSession, hasConnectedCookie, getServerSnapshot)

  // Access token lives in JS memory only — not localStorage. On reload it's
  // reminted via the httpOnly refresh cookie.
  const tokenRef = useRef<AccessToken | null>(null)
  const refreshInFlightRef = useRef<Promise<AccessToken | null> | null>(null)

  useEffect(() => {
    clearLegacyStorage()
  }, [])

  const connect = useCallback(() => {
    // Server-managed OAuth: /start sets the state cookie and 302s to Strava.
    // A full navigation is required (not the Next router): the target is a
    // route handler that redirects off-site.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/api/auth/strava/start'
  }, [])

  const disconnect = useCallback(() => {
    tokenRef.current = null
    // Drop the readable flag immediately so the UI updates without waiting on
    // the round-trip; the server clears the httpOnly refresh cookie.
    document.cookie = `${STRAVA_CONNECTED_COOKIE}=; Max-Age=0; path=/`
    notifySessionChange()
    void fetch('/api/auth/strava/logout', { method: 'POST', credentials: 'same-origin' })
      .catch(() => {})
      .finally(notifySessionChange)
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
    tokenRef.current = refreshed
    // On failure the server has cleared the session cookies; on success the
    // flag cookie is already present. Either way, resync the store.
    notifySessionChange()
    return refreshed?.access_token ?? null
  }, [])

  return { isConnected, connect, disconnect, getAccessToken }
}
