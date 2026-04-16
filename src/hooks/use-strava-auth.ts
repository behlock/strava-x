'use client'

import { useCallback, useEffect, useState } from 'react'
import { buildAuthUrl, refreshAccessToken, type StravaTokens } from '@/lib/strava'

const STORAGE_KEY = 'strava-x:tokens'
const REFRESH_SKEW_SECONDS = 60

function readTokens(): StravaTokens | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StravaTokens
  } catch {
    return null
  }
}

function writeTokens(tokens: StravaTokens | null) {
  if (typeof window === 'undefined') return
  if (tokens) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
  } else {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

// Reads `#strava_auth=...` fragment left by the OAuth callback, stores the
// tokens, and scrubs the URL. Returns the tokens if a handoff happened.
function consumeHashTokens(): StravaTokens | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  if (!hash.startsWith('#strava_auth=')) return null

  const params = new URLSearchParams(hash.slice('#strava_auth='.length))
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  const expires_at = Number(params.get('expires_at'))
  const athleteIdRaw = params.get('athlete_id')

  // Scrub the fragment immediately so tokens don't linger in window.location.
  history.replaceState(null, '', window.location.pathname + window.location.search)

  if (!access_token || !refresh_token || !expires_at) return null
  return {
    access_token,
    refresh_token,
    expires_at,
    athlete_id: athleteIdRaw ? Number(athleteIdRaw) : undefined,
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
  const [tokens, setTokens] = useState<StravaTokens | null>(null)
  const [justConnected, setJustConnected] = useState(false)

  useEffect(() => {
    const fromHash = consumeHashTokens()
    if (fromHash) {
      writeTokens(fromHash)
      setTokens(fromHash)
      setJustConnected(true)
      return
    }
    setTokens(readTokens())
  }, [])

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return
    const redirectUri = `${window.location.origin}/api/auth/strava/callback`
    window.location.href = buildAuthUrl(redirectUri)
  }, [])

  const disconnect = useCallback(() => {
    writeTokens(null)
    setTokens(null)
    setJustConnected(false)
  }, [])

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const current = readTokens()
    if (!current) return null

    const now = Math.floor(Date.now() / 1000)
    if (current.expires_at > now + REFRESH_SKEW_SECONDS) {
      return current.access_token
    }

    try {
      const refreshed = await refreshAccessToken(current.refresh_token)
      const next: StravaTokens = { ...current, ...refreshed }
      writeTokens(next)
      setTokens(next)
      return next.access_token
    } catch {
      writeTokens(null)
      setTokens(null)
      return null
    }
  }, [])

  return {
    isConnected: !!tokens,
    justConnected,
    connect,
    disconnect,
    getAccessToken,
  }
}
