'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'

import type { Activity } from '@/models/activity'
import { DEFAULT_MAP_POSITION, type MapBounds, type MapPosition } from '@/models/map'
import { latestActivityStart } from '@/lib/activities'
import { clusterActivities } from '@/lib/clusters'
import { useLocalStorageItem, writeLocalStorage } from '@/hooks/use-local-storage'

export type PositionSource = 'saved' | 'busiest' | 'activity' | 'default'
export type MapPositionMode = 'own' | 'public'

interface UsePersistedMapPositionResult {
  position: MapPosition
  initialBounds: MapBounds | null
  source: PositionSource
  savePosition: (position: MapPosition) => void
}

const STORAGE_KEY = 'strava-x-map-position'
const BUSIEST_FALLBACK_ZOOM = 11
const ACTIVITY_FALLBACK_ZOOM = 12
const SAVE_DEBOUNCE_MS = 500

function parsePosition(raw: string | null): MapPosition | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<MapPosition>
    if (
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number' &&
      typeof parsed.zoom === 'number'
    ) {
      return { latitude: parsed.latitude, longitude: parsed.longitude, zoom: parsed.zoom }
    }
  } catch {
    // Invalid JSON
  }
  return null
}

/**
 * Picks the map's starting view, in priority order: the saved pan/zoom
 * ("own" mode only), the busiest activity cluster, the latest activity's
 * start, then a hardcoded default.
 */
export function usePersistedMapPosition(
  activities: Activity[],
  mode: MapPositionMode = 'own',
): UsePersistedMapPositionResult {
  const isOwnMode = mode === 'own'

  // Public maps never read or write the local cache — it belongs to the
  // viewer's own map.
  const storedRaw = useLocalStorageItem(STORAGE_KEY)
  const savedPosition = useMemo(() => (isOwnMode ? parsePosition(storedRaw) : null), [isOwnMode, storedRaw])

  const busiestArea = useMemo(() => {
    const top = clusterActivities(activities)[0]
    if (!top) return null
    const { minLat, maxLat, minLng, maxLng } = top.bounds
    // Pad slightly so points don't sit on the very edge of the viewport.
    const padLng = Math.max(maxLng - minLng, 0.05) * 0.1
    const padLat = Math.max(maxLat - minLat, 0.05) * 0.1
    const bounds: MapBounds = [
      [minLng - padLng, minLat - padLat],
      [maxLng + padLng, maxLat + padLat],
    ]
    return { bounds, center: top.centroid }
  }, [activities])

  const latestActivityPosition = useMemo((): MapPosition | null => {
    const start = latestActivityStart(activities)
    return start ? { ...start, zoom: ACTIVITY_FALLBACK_ZOOM } : null
  }, [activities])

  // Debounced write; the pending value is flushed on unmount so a quick
  // navigation away doesn't lose the last pan.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPositionRef = useRef<MapPosition | null>(null)

  const savePosition = useCallback(
    (position: MapPosition) => {
      if (!isOwnMode) return
      pendingPositionRef.current = position
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(() => {
        writeLocalStorage(STORAGE_KEY, JSON.stringify(position))
        pendingPositionRef.current = null
      }, SAVE_DEBOUNCE_MS)
    },
    [isOwnMode],
  )

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      if (pendingPositionRef.current) {
        writeLocalStorage(STORAGE_KEY, JSON.stringify(pendingPositionRef.current))
      }
    }
  }, [])

  return useMemo((): UsePersistedMapPositionResult => {
    if (savedPosition) {
      return { position: savedPosition, initialBounds: null, source: 'saved', savePosition }
    }
    if (busiestArea) {
      return {
        position: { ...busiestArea.center, zoom: BUSIEST_FALLBACK_ZOOM },
        initialBounds: busiestArea.bounds,
        source: 'busiest',
        savePosition,
      }
    }
    if (latestActivityPosition) {
      return { position: latestActivityPosition, initialBounds: null, source: 'activity', savePosition }
    }
    return { position: DEFAULT_MAP_POSITION, initialBounds: null, source: 'default', savePosition }
  }, [savedPosition, busiestArea, latestActivityPosition, savePosition])
}
