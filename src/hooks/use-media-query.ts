'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * SSR-safe media query hook using useSyncExternalStore.
 * Returns false on server, actual value on client.
 */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', callback)
      return () => media.removeEventListener('change', callback)
    },
    [query],
  )

  const getSnapshot = useCallback(() => {
    return window.matchMedia(query).matches
  }, [query])

  const getServerSnapshot = useCallback(() => false, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function useIsMobile(): boolean {
  // Query mobile directly so the server snapshot does not render a mobile
  // drawer on desktop before hydration.
  return useMediaQuery('(width < 768px)')
}
