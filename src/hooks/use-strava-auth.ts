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

/**
 * Outcome of resolving an access token. `unauthenticated` means the session
 * is really gone (the refresh route answered 401/400); `unavailable` is a
 * transient failure (network, 5xx, 429, Strava down) worth retrying.
 */
export type AccessTokenResult =
  { status: 'ok'; accessToken: string } | { status: 'unauthenticated' } | { status: 'unavailable' }

type RefreshResult = { ok: true; token: AccessToken } | { ok: false; status: 'unauthenticated' | 'unavailable' }

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

async function refreshFromServer(): Promise<RefreshResult> {
  try {
    const res = await fetch('/api/auth/strava/refresh', { method: 'POST', credentials: 'same-origin' })
    if (!res.ok) {
      // 401 (no cookie / Strava refused, cookies cleared) and 400 mean the
      // session is over. Anything else — 429, 5xx, the route's
      // 'strava_unavailable' — is Strava or the network having a moment.
      return { ok: false, status: res.status === 401 || res.status === 400 ? 'unauthenticated' : 'unavailable' }
    }
    const body = (await res.json()) as { access_token?: unknown; expires_at?: unknown }
    if (typeof body.access_token !== 'string' || typeof body.expires_at !== 'number') {
      return { ok: false, status: 'unavailable' }
    }
    return { ok: true, token: { access_token: body.access_token, expires_at: body.expires_at } }
  } catch {
    return { ok: false, status: 'unavailable' }
  }
}

export interface UseStravaAuth {
  isConnected: boolean
  connect: () => void
  disconnect: () => void
  /** Resolves a valid access token, reminting via the refresh cookie when needed; `null` on any failure. */
  getAccessToken: () => Promise<string | null>
  /** Like `getAccessToken` but says whether a failure is a dead session or a transient outage. */
  resolveAccessToken: () => Promise<AccessTokenResult>
}

export function useStravaAuth(): UseStravaAuth {
  const isConnected = useSyncExternalStore(subscribeSession, hasConnectedCookie, getServerSnapshot)

  // Access token lives in JS memory only — not localStorage. On reload it's
  // reminted via the httpOnly refresh cookie.
  const tokenRef = useRef<AccessToken | null>(null)
  const refreshInFlightRef = useRef<Promise<RefreshResult> | null>(null)
  // Bumped by `disconnect` so a refresh that was in flight at the time can't
  // re-establish the session when it resolves.
  const disconnectGenerationRef = useRef(0)

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
    disconnectGenerationRef.current++
    tokenRef.current = null
    // Drop the readable flag immediately so the UI updates without waiting on
    // the round-trip; the server clears the httpOnly refresh cookie.
    document.cookie = `${STRAVA_CONNECTED_COOKIE}=; Max-Age=0; path=/`
    notifySessionChange()
    // Logout only after any in-flight refresh has settled. The refresh
    // response carries Set-Cookie for the rotated refresh token, and the
    // browser applies it as soon as the headers arrive — so if logout raced
    // ahead, the refresh's cookies would land last and silently re-open the
    // session. Waiting makes logout's Max-Age=0 the final word on the cookie
    // jar; the refresh result itself is discarded by the generation check in
    // `resolveAccessToken`.
    const inFlight = refreshInFlightRef.current ?? Promise.resolve()
    void inFlight
      .catch(() => {})
      .then(() => fetch('/api/auth/strava/logout', { method: 'POST', credentials: 'same-origin' }))
      .catch(() => {})
      .finally(notifySessionChange)
  }, [])

  const resolveAccessToken = useCallback(async (): Promise<AccessTokenResult> => {
    const cached = tokenRef.current
    const now = Math.floor(Date.now() / 1000)
    if (cached && cached.expires_at > now + REFRESH_SKEW_SECONDS) {
      return { status: 'ok', accessToken: cached.access_token }
    }

    // Dedupe concurrent refresh calls — Strava rotates the refresh_token on
    // each successful refresh, so firing two in parallel invalidates the
    // second one.
    if (!refreshInFlightRef.current) {
      refreshInFlightRef.current = refreshFromServer().finally(() => {
        refreshInFlightRef.current = null
      })
    }

    const generation = disconnectGenerationRef.current
    const refreshed = await refreshInFlightRef.current
    // Disconnected while the refresh was in flight: the caller no longer has
    // a session, whatever the server said.
    if (generation !== disconnectGenerationRef.current) return { status: 'unauthenticated' }

    tokenRef.current = refreshed.ok ? refreshed.token : null
    // On an auth failure the server has cleared the session cookies; on
    // success the flag cookie is already present. Either way, resync the store.
    notifySessionChange()
    if (!refreshed.ok) return { status: refreshed.status }
    return { status: 'ok', accessToken: refreshed.token.access_token }
  }, [])

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const result = await resolveAccessToken()
    return result.status === 'ok' ? result.accessToken : null
  }, [resolveAccessToken])

  return { isConnected, connect, disconnect, getAccessToken, resolveAccessToken }
}
