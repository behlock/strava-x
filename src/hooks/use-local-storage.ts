'use client'

import { useSyncExternalStore } from 'react'

// Writes made through `writeLocalStorage` notify same-tab subscribers; the
// native `storage` event covers other tabs.
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

export function readLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Writes (or removes, when `value` is null) and notifies subscribers. Silently ignores quota/private-mode errors. */
export function writeLocalStorage(key: string, value: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // localStorage can be full or disabled (private mode); callers treat it as best-effort.
  }
  for (const listener of listeners) listener()
}

const getServerSnapshot = () => null

/**
 * SSR-safe subscription to a single localStorage key. Returns `null` during
 * server rendering and hydration, then the live value.
 */
export function useLocalStorageItem(key: string): string | null {
  return useSyncExternalStore(subscribe, () => readLocalStorage(key), getServerSnapshot)
}
