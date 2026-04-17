'use client'

import { useCallback, useEffect, useState } from 'react'

const DISMISS_KEY = 'strava-x:welcome_dismissed'

interface UseWelcomePanelArgs {
  stravaConnected: boolean
  hasCachedActivities: boolean
  isCacheLoading: boolean
}

export interface UseWelcomePanel {
  open: boolean
  dismiss: () => void
}

export function useWelcomePanel({
  stravaConnected,
  hasCachedActivities,
  isCacheLoading,
}: UseWelcomePanelArgs): UseWelcomePanel {
  const [open, setOpen] = useState(false)
  const [dismissedChecked, setDismissedChecked] = useState(false)
  const [previouslyDismissed, setPreviouslyDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setPreviouslyDismissed(window.localStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      // localStorage can throw in private modes — treat as not dismissed.
    }
    setDismissedChecked(true)
  }, [])

  useEffect(() => {
    if (!dismissedChecked) return
    if (isCacheLoading) return
    if (previouslyDismissed) return
    if (stravaConnected) return
    if (hasCachedActivities) return
    setOpen(true)
  }, [dismissedChecked, isCacheLoading, previouslyDismissed, stravaConnected, hasCachedActivities])

  const dismiss = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(DISMISS_KEY, '1')
      } catch {
        // ignore — we'll still hide the panel for the session via state.
      }
    }
    setPreviouslyDismissed(true)
    setOpen(false)
  }, [])

  return { open, dismiss }
}
