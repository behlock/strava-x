'use client'

import { useEffect, useState } from 'react'

import { fetchStravaProfile, type StravaProfile } from '@/lib/strava-profile'

/** Reload the connected athlete's photo per session; never persist it across accounts. */
export function useStravaProfile(
  isConnected: boolean,
  getAccessToken: () => Promise<string | null>,
): StravaProfile | null {
  const [profile, setProfile] = useState<StravaProfile | null>(null)

  useEffect(() => {
    if (!isConnected) return
    const controller = new AbortController()

    void (async () => {
      try {
        const token = await getAccessToken()
        if (!token || controller.signal.aborted) return
        const profile = await fetchStravaProfile(token, controller.signal)
        if (!controller.signal.aborted) setProfile(profile)
      } catch {
        // An unavailable photo must not interrupt sign-in or activity sync.
      }
    })()

    return () => controller.abort()
  }, [isConnected, getAccessToken])

  // Clear a previous account's photo before rendering another session.
  const [wasConnected, setWasConnected] = useState(isConnected)
  if (wasConnected !== isConnected) {
    setWasConnected(isConnected)
    setProfile(null)
    return null
  }
  return isConnected ? profile : null
}
