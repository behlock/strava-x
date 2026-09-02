'use client'

import { useMemo } from 'react'

import type { Activity } from '@/models/activity'
import { getActivityColor } from '@/lib/activity-colors'

export interface ActivityTypeBreakdown {
  type: string
  count: number
  distance: number
  elevation: number
  color: string
}

export interface Statistics {
  totalActivities: number
  /** Kilometers. */
  totalDistance: number
  /** Meters. */
  totalElevation: number
  /** Per activity type, most frequent first. */
  breakdown: ActivityTypeBreakdown[]
}

export function useStatistics(activities: Activity[]): Statistics {
  return useMemo(() => {
    const byType = new Map<string, ActivityTypeBreakdown>()
    let totalDistance = 0
    let totalElevation = 0

    for (const activity of activities) {
      totalDistance += activity.distance
      totalElevation += activity.elevationGain

      const type = activity.type || 'unknown'
      let entry = byType.get(type)
      if (!entry) {
        entry = { type, count: 0, distance: 0, elevation: 0, color: getActivityColor(type) }
        byType.set(type, entry)
      }
      entry.count += 1
      entry.distance += activity.distance
      entry.elevation += activity.elevationGain
    }

    return {
      totalActivities: activities.length,
      totalDistance,
      totalElevation,
      breakdown: [...byType.values()].sort((a, b) => b.count - a.count),
    }
  }, [activities])
}
