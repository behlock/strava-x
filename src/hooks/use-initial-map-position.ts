'use client'

import { useState, useEffect, useMemo } from 'react'
import { Activity } from '@/models/activity'

export type PositionSource = 'geolocation' | 'activity' | 'default'

export interface MapPosition {
  latitude: number
  longitude: number
  zoom: number
}

interface UseInitialMapPositionResult {
  position: MapPosition
  isLoading: boolean
  source: PositionSource
}

const DEFAULT_POSITION: MapPosition = {
  latitude: 51.5074,
  longitude: -0.1278,
  zoom: 15,
}

const GEOLOCATION_TIMEOUT = 5000
const GEOLOCATION_MAX_AGE = 5 * 60 * 1000 // 5 minutes

export function useInitialMapPosition(activities: Activity[]): UseInitialMapPositionResult {
  const [geolocationPosition, setGeolocationPosition] = useState<MapPosition | null>(null)
  const [geolocationError, setGeolocationError] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Get position from latest activity
  const latestActivityPosition = useMemo((): MapPosition | null => {
    if (activities.length === 0) return null

    // Sort by date descending to get the latest activity
    const sortedActivities = [...activities]
      .filter((a) => a.date && a.feature?.geometry?.coordinates?.length && a.feature.geometry.coordinates.length > 0)
      .sort((a, b) => {
        if (!a.date || !b.date) return 0
        return b.date.getTime() - a.date.getTime()
      })

    const latestActivity = sortedActivities[0]
    if (!latestActivity?.feature?.geometry.coordinates.length) return null

    const [longitude, latitude] = latestActivity.feature.geometry.coordinates[0]
    return {
      latitude,
      longitude,
      zoom: 12,
    }
  }, [activities])

  // Request geolocation on mount
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeolocationError(true)
      setIsLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeolocationPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          zoom: 12,
        })
        setIsLoading(false)
      },
      () => {
        setGeolocationError(true)
        setIsLoading(false)
      },
      {
        enableHighAccuracy: false,
        timeout: GEOLOCATION_TIMEOUT,
        maximumAge: GEOLOCATION_MAX_AGE,
      }
    )
  }, [])

  // Determine final position based on priority chain
  const result = useMemo((): UseInitialMapPositionResult => {
    // Priority 1: User's browser geolocation
    if (geolocationPosition) {
      return {
        position: geolocationPosition,
        isLoading: false,
        source: 'geolocation',
      }
    }

    // Still loading geolocation
    if (isLoading) {
      return {
        position: DEFAULT_POSITION,
        isLoading: true,
        source: 'default',
      }
    }

    // Priority 2: Latest activity's starting coordinates
    if (geolocationError && latestActivityPosition) {
      return {
        position: latestActivityPosition,
        isLoading: false,
        source: 'activity',
      }
    }

    // Priority 3: Default location (London)
    return {
      position: DEFAULT_POSITION,
      isLoading: false,
      source: 'default',
    }
  }, [geolocationPosition, geolocationError, latestActivityPosition, isLoading])

  return result
}
