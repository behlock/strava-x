'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Activity } from '@/models/activity'

export type PositionSource = 'saved' | 'geolocation' | 'activity' | 'default'

export interface MapPosition {
  latitude: number
  longitude: number
  zoom: number
}

interface UsePersistedMapPositionResult {
  position: MapPosition
  isLoading: boolean
  source: PositionSource
  savePosition: (position: MapPosition) => void
}

const STORAGE_KEY = 'strava-x-map-position'
const DEFAULT_POSITION: MapPosition = {
  latitude: 51.5074,
  longitude: -0.1278,
  zoom: 15,
}
const GEOLOCATION_TIMEOUT = 5000
const GEOLOCATION_MAX_AGE = 5 * 60 * 1000 // 5 minutes
const DEBOUNCE_MS = 500

function readFromStorage(): MapPosition | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored)
    if (
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number' &&
      typeof parsed.zoom === 'number'
    ) {
      return parsed as MapPosition
    }
  } catch {
    // Invalid JSON or localStorage error
  }
  return null
}

export function usePersistedMapPosition(activities: Activity[]): UsePersistedMapPositionResult {
  // Start with null, will be populated after mount
  const [savedPosition, setSavedPosition] = useState<MapPosition | null>(null)
  const [geolocationPosition, setGeolocationPosition] = useState<MapPosition | null>(null)
  const [geolocationError, setGeolocationError] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [hasCheckedStorage, setHasCheckedStorage] = useState<boolean>(false)

  // Debounce timer and pending position refs
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPositionRef = useRef<MapPosition | null>(null)

  // Read from localStorage after mount (client-side only)
  useEffect(() => {
    const stored = readFromStorage()
    if (stored) {
      setSavedPosition(stored)
      setIsLoading(false)
    }
    setHasCheckedStorage(true)
  }, [])

  // Get position from latest activity
  const latestActivityPosition = useMemo((): MapPosition | null => {
    if (activities.length === 0) return null

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

  // Request geolocation only if no saved position and we've checked storage
  useEffect(() => {
    // Wait until we've checked storage
    if (!hasCheckedStorage) return

    // Skip geolocation if we have a saved position
    if (savedPosition) {
      setIsLoading(false)
      return
    }

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
  }, [hasCheckedStorage, savedPosition])

  // Debounced save function
  const savePosition = useCallback((position: MapPosition) => {
    pendingPositionRef.current = position

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(position))
        setSavedPosition(position)
        pendingPositionRef.current = null
      } catch (e) {
        console.error('Failed to save map position:', e)
      }
    }, DEBOUNCE_MS)
  }, [])

  // Flush pending save and cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      // Save any pending position before unmount
      if (pendingPositionRef.current) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingPositionRef.current))
        } catch (e) {
          console.error('Failed to save map position on unmount:', e)
        }
      }
    }
  }, [])

  // Determine final position based on priority chain
  const result = useMemo((): UsePersistedMapPositionResult => {
    // Still checking storage
    if (!hasCheckedStorage) {
      return {
        position: DEFAULT_POSITION,
        isLoading: true,
        source: 'default',
        savePosition,
      }
    }

    // Priority 1: Saved position from localStorage
    if (savedPosition) {
      return {
        position: savedPosition,
        isLoading: false,
        source: 'saved',
        savePosition,
      }
    }

    // Still loading geolocation
    if (isLoading) {
      return {
        position: DEFAULT_POSITION,
        isLoading: true,
        source: 'default',
        savePosition,
      }
    }

    // Priority 2: User's browser geolocation
    if (geolocationPosition) {
      return {
        position: geolocationPosition,
        isLoading: false,
        source: 'geolocation',
        savePosition,
      }
    }

    // Priority 3: Latest activity's starting coordinates
    if (geolocationError && latestActivityPosition) {
      return {
        position: latestActivityPosition,
        isLoading: false,
        source: 'activity',
        savePosition,
      }
    }

    // Priority 4: Default location (London)
    return {
      position: DEFAULT_POSITION,
      isLoading: false,
      source: 'default',
      savePosition,
    }
  }, [hasCheckedStorage, savedPosition, geolocationPosition, geolocationError, latestActivityPosition, isLoading, savePosition])

  return result
}
