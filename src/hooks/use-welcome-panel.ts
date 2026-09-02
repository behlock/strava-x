'use client'

import { useCallback, useState } from 'react'

import { useLocalStorageItem, writeLocalStorage } from '@/hooks/use-local-storage'

const DISMISS_KEY = 'strava-x:welcome_dismissed'

interface UseWelcomePanelArgs {
  stravaConnected: boolean
  hasActivities: boolean
  /** True while activities are still being restored from IndexedDB. */
  isRestoring: boolean
}

export interface UseWelcomePanel {
  open: boolean
  dismiss: () => void
}

/** Shows the welcome panel to first-time visitors with nothing to look at yet. */
export function useWelcomePanel({ stravaConnected, hasActivities, isRestoring }: UseWelcomePanelArgs): UseWelcomePanel {
  const persistedDismissed = useLocalStorageItem(DISMISS_KEY) === '1'
  // Session fallback for when localStorage is unavailable (private mode).
  const [dismissedThisSession, setDismissedThisSession] = useState(false)

  const open = !persistedDismissed && !dismissedThisSession && !isRestoring && !stravaConnected && !hasActivities

  const dismiss = useCallback(() => {
    setDismissedThisSession(true)
    writeLocalStorage(DISMISS_KEY, '1')
  }, [])

  return { open, dismiss }
}
