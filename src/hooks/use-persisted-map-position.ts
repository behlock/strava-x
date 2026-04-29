'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Activity } from '@/models/activity'
import { findBusiestArea } from '@/lib/busiest-area'

export type PositionSource = 'saved' | 'busiest' | 'activity' | 'default'
export type MapPositionMode = 'own' | 'public'

export interface MapPosition {
  latitude: number
  longitude: number
  zoom: number
}

export type MapBounds = [[number, number], [number, number]]

interface UsePersistedMapPositionResult {
  position: MapPosition
  initialBounds: MapBounds | null
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
const BUSIEST_FALLBACK_ZOOM = 11
const ACTIVITY_FALLBACK_ZOOM = 12
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

export function usePersistedMapPosition(
  activities: Activity[],
  mode: MapPositionMode = 'own',
): UsePersistedMapPositionResult {
  const isOwnMode = mode === 'own'

  const [savedPosition, setSavedPosition] = useState<MapPosition | null>(null)
  const [hasCheckedStorage, setHasCheckedStorage] = useState<boolean>(!isOwnMode)

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPositionRef = useRef<MapPosition | null>(null)

  // Read from localStorage on mount — only in own mode. Public maps never
  // read or write the local cache (it belongs to the viewer's own map).
  useEffect(() => {
    if (!isOwnMode) return
    const stored = readFromStorage()
    if (stored) setSavedPosition(stored)
    setHasCheckedStorage(true)
  }, [isOwnMode])

  const busiestArea = useMemo(() => findBusiestArea(activities), [activities])

  const latestActivityPosition = useMemo((): MapPosition | null => {
    if (activities.length === 0) return null

    let latest: Activity | null = null
    let latestTs = -Infinity
    for (const a of activities) {
      if (!a.date) continue
      if (!a.feature?.geometry?.coordinates?.length) continue
      const ts = a.date.getTime()
      if (ts > latestTs) {
        latestTs = ts
        latest = a
      }
    }
    if (!latest?.feature?.geometry.coordinates.length) return null

    const [longitude, latitude] = latest.feature.geometry.coordinates[0]
    return { latitude, longitude, zoom: ACTIVITY_FALLBACK_ZOOM }
  }, [activities])

  const savePosition = useCallback(
    (position: MapPosition) => {
      if (!isOwnMode) return
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
    },
    [isOwnMode],
  )

  // Flush pending save and cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (pendingPositionRef.current) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingPositionRef.current))
        } catch (e) {
          console.error('Failed to save map position on unmount:', e)
        }
      }
    }
  }, [])

  const result = useMemo((): UsePersistedMapPositionResult => {
    if (isOwnMode && !hasCheckedStorage) {
      return {
        position: DEFAULT_POSITION,
        initialBounds: null,
        isLoading: true,
        source: 'default',
        savePosition,
      }
    }

    // Priority 1 (own mode only): saved pan/zoom from localStorage.
    if (isOwnMode && savedPosition) {
      return {
        position: savedPosition,
        initialBounds: null,
        isLoading: false,
        source: 'saved',
        savePosition,
      }
    }

    // Priority 2: busiest activity cluster.
    if (busiestArea) {
      return {
        position: {
          latitude: busiestArea.center.latitude,
          longitude: busiestArea.center.longitude,
          zoom: BUSIEST_FALLBACK_ZOOM,
        },
        initialBounds: busiestArea.bounds,
        isLoading: false,
        source: 'busiest',
        savePosition,
      }
    }

    // Priority 3: latest activity start point.
    if (latestActivityPosition) {
      return {
        position: latestActivityPosition,
        initialBounds: null,
        isLoading: false,
        source: 'activity',
        savePosition,
      }
    }

    // Priority 4: hardcoded default.
    return {
      position: DEFAULT_POSITION,
      initialBounds: null,
      isLoading: false,
      source: 'default',
      savePosition,
    }
  }, [isOwnMode, hasCheckedStorage, savedPosition, busiestArea, latestActivityPosition, savePosition])

  return result
}
