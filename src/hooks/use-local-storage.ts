'use client'

import { useCallback, useSyncExternalStore } from 'react'

// Writes made through `writeLocalStorage` notify same-tab subscribers; the
// native `storage` event covers other tabs.
const listeners = new Map<string, Set<() => void>>()

function notifyKey(key: string | null) {
  if (key === null) {
    for (const group of listeners.values()) for (const listener of group) listener()
  } else {
    for (const listener of listeners.get(key) ?? []) listener()
  }
}

function handleStorage(event: StorageEvent) {
  if (event.storageArea === window.localStorage) notifyKey(event.key)
}

function subscribe(key: string, listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', handleStorage)
  let group = listeners.get(key)
  if (!group) {
    group = new Set()
    listeners.set(key, group)
  }
  group.add(listener)
  return () => {
    group.delete(listener)
    if (group.size === 0) listeners.delete(key)
    if (listeners.size === 0) window.removeEventListener('storage', handleStorage)
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
  notifyKey(key)
}

const getServerSnapshot = () => null

/**
 * SSR-safe subscription to a single localStorage key. Returns `null` during
 * server rendering and hydration, then the live value.
 */
export function useLocalStorageItem(key: string): string | null {
  return useSyncExternalStore(
    useCallback((listener) => subscribe(key, listener), [key]),
    () => readLocalStorage(key),
    getServerSnapshot,
  )
}
