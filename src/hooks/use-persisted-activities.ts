'use client'
import { useCallback, useRef, useState } from 'react'
import type { Activity } from '@/models/activity'
import { clearActivities, loadActivities } from '@/lib/activities-db'
import type { ActivityLibrary } from '@/lib/activities-db'

/** Restore only after verifying the account; legacy unscoped caches are ignored. */
export function usePersistedActivities() {
  const [activities, setActivities] = useState<Activity[]>([])
  const generation = useRef(0)
  const library = useRef<{ athleteId: number; value: ActivityLibrary } | null>(null)
  const setLibrary = useCallback((athleteId: number, value: ActivityLibrary) => {
    library.current = { athleteId, value }
    setActivities(value.activities)
  }, [])
  const restore = useCallback(async (athleteId: number, signal: AbortSignal) => {
    if (signal.aborted) return null
    if (library.current?.athleteId === athleteId) return library.current.value
    const version = ++generation.current
    setActivities([])
    const stored = await loadActivities(athleteId)
    if (signal.aborted || version !== generation.current) return null
    library.current = stored ? { athleteId, value: stored } : null
    setActivities(stored?.activities ?? [])
    return stored
  }, [])
  const clear = useCallback(async (waitFor?: Promise<unknown>) => {
    generation.current++
    library.current = null
    setActivities([])
    await waitFor?.catch(() => {})
    await clearActivities()
  }, [])
  return { activities, setLibrary, restore, clear }
}
