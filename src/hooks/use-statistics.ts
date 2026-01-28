'use client'

import { useMemo } from 'react'
import { Activity } from '@/models/activity'

export interface ActivityTypeBreakdown {
  type: string
  count: number
  distance: number
  elevation: number
  color: string
}

export interface Statistics {
  totalActivities: number
  totalDistance: number // in km
  totalElevation: number // in meters
  breakdown: ActivityTypeBreakdown[]
}

const ACTIVITY_TYPE_COLORS: Record<string, string> = {
  running: '#FF5500',  // TE signature orange
  cycling: '#FFE600',  // electric yellow
  hiking: '#00FF87',   // neon green
  walking: '#00D4FF',  // electric cyan
}

const DEFAULT_COLOR = '#FF0080' // hot pink

export function useStatistics(activities: Activity[]): Statistics {
  return useMemo(() => {
    const totalActivities = activities.length
    const totalDistance = activities.reduce((sum, a) => sum + a.distance, 0)
    const totalElevation = activities.reduce((sum, a) => sum + a.elevationGain, 0)

    // Group by activity type
    const typeMap = new Map<string, { count: number; distance: number; elevation: number }>()

    for (const activity of activities) {
      const type = activity.type || 'unknown'
      const existing = typeMap.get(type) || { count: 0, distance: 0, elevation: 0 }
      typeMap.set(type, {
        count: existing.count + 1,
        distance: existing.distance + activity.distance,
        elevation: existing.elevation + activity.elevationGain,
      })
    }

    const breakdown: ActivityTypeBreakdown[] = Array.from(typeMap.entries())
      .map(([type, data]) => ({
        type,
        count: data.count,
        distance: data.distance,
        elevation: data.elevation,
        color: ACTIVITY_TYPE_COLORS[type] || DEFAULT_COLOR,
      }))
      .sort((a, b) => b.count - a.count)

    return {
      totalActivities,
      totalDistance,
      totalElevation,
      breakdown,
    }
  }, [activities])
}

export function getActivityColor(type: string | null): string {
  if (!type) return DEFAULT_COLOR
  return ACTIVITY_TYPE_COLORS[type] || DEFAULT_COLOR
}
