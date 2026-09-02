'use client'

import { useCallback, useEffect, useState } from 'react'

import type { Activity } from '@/models/activity'
import { clearActivities, loadActivities } from '@/lib/activities-db'

/**
 * Activity state backed by IndexedDB: restored on mount and cleared on
 * demand. Writing new activities is the caller's job (`saveActivities`), so
 * a sync can persist page by page.
 */
export function usePersistedActivities() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [isRestoring, setIsRestoring] = useState(true)

  useEffect(() => {
    let cancelled = false
    loadActivities()
      .then((stored) => {
        if (!cancelled && stored.length > 0) setActivities(stored)
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const clear = useCallback(async () => {
    setActivities([])
    await clearActivities()
  }, [])

  return { activities, setActivities, isRestoring, clear }
}
