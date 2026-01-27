'use client'

import { useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}

/**
 * SSR-safe hook to detect when the component has mounted on the client.
 * Uses useSyncExternalStore for proper hydration handling.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,  // Client: always mounted
    () => false  // Server: never mounted
  )
}
