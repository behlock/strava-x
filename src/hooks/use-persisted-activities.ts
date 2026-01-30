'use client'

import { useState, useEffect, useCallback } from 'react'
import { Activity } from '@/models/activity'
import { loadActivities, saveActivities, clearActivities } from '@/lib/activities-db'

export function usePersistedActivities() {
  const [cachedActivities, setCachedActivities] = useState<Activity[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load from IndexedDB on mount
  useEffect(() => {
    loadActivities()
      .then((activities) => {
        if (activities.length > 0) {
          setCachedActivities(activities)
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }, [])

  const save = useCallback(async (activities: Activity[]) => {
    try {
      await saveActivities(activities)
      setCachedActivities(activities)
    } catch (e) {
      console.error('Failed to cache activities:', e)
    }
  }, [])

  const clear = useCallback(async () => {
    try {
      await clearActivities()
      setCachedActivities(null)
    } catch (e) {
      console.error('Failed to clear cache:', e)
    }
  }, [])

  return { cachedActivities, isLoading, saveActivities: save, clearActivities: clear }
}
