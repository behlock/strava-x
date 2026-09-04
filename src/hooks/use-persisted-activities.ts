'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { Activity } from '@/models/activity'
import { mergeActivities } from '@/lib/activities'
import { clearActivities, loadActivities } from '@/lib/activities-db'

/**
 * Activity state backed by IndexedDB: restored on mount and cleared on
 * demand. Writing new activities is the caller's job (`saveActivities`), so
 * a sync can persist page by page.
 */
export function usePersistedActivities() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [isRestoring, setIsRestoring] = useState(true)

  // Bumped by `clear` and on unmount so a restore that resolves afterwards is
  // discarded instead of resurrecting the wiped library.
  const generationRef = useRef(0)

  useEffect(() => {
    const generations = generationRef
    const generation = ++generations.current
    const isCurrent = () => generation === generations.current
    loadActivities()
      .then((stored) => {
        if (!isCurrent() || stored.length === 0) return
        // A sync may already be merging pages into state (the page starts the
        // auto-sync in the same commit), so merge rather than replace. Rows
        // already in state are the freshest, so they win on id collisions.
        setActivities((current) => mergeActivities(current, stored))
      })
      .finally(() => {
        if (isCurrent()) setIsRestoring(false)
      })
    return () => {
      generations.current++
    }
  }, [])

  /**
   * Empties state right away and wipes the store. `waitFor` delays only the
   * wipe — pass any in-flight `saveActivities` promises so a write that lands
   * after the wipe can't bring the activities back.
   */
  const clear = useCallback(async (waitFor?: Promise<unknown>) => {
    generationRef.current++
    setActivities([])
    setIsRestoring(false)
    if (waitFor) await waitFor.catch(() => {})
    await clearActivities()
  }, [])

  return { activities, setActivities, isRestoring, clear }
}
