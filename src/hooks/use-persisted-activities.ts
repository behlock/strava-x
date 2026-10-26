'use client'
import { useCallback, useRef, useState } from 'react'
import type { Activity } from '@/models/activity'
import { clearActivities, loadActivities } from '@/lib/activities-db'

/** Restore only after verifying the account; legacy unscoped caches are ignored. */
export function usePersistedActivities() {
  const [activities, setActivities] = useState<Activity[]>([])
  const generation = useRef(0)
  const restore = useCallback(async (athleteId: number, signal: AbortSignal) => {
    const version = ++generation.current
    setActivities([])
    const stored = await loadActivities(athleteId)
    if (!signal.aborted && version === generation.current) setActivities(stored)
  }, [])
  const clear = useCallback(async (waitFor?: Promise<unknown>) => {
    generation.current++
    setActivities([])
    await waitFor?.catch(() => {})
    await clearActivities()
  }, [])
  return { activities, setActivities, restore, clear }
}
