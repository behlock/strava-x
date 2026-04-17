'use client'

import { useCallback, useEffect, useMemo, useState, useRef, startTransition } from 'react'
import dynamic from 'next/dynamic'

import { AppShell, Header, FilterPanel, StatsPanel, ActivityList, MapSkeleton } from '@/components/ui'

import { fetchAllActivities } from '@/lib/strava'
import { config } from '@/lib/config'
import { Activity, ActivityFeatureCollection } from '@/models/activity'
import { useStatistics } from '@/hooks/use-statistics'
import { usePersistedMapPosition } from '@/hooks/use-persisted-map-position'
import { usePersistedActivities } from '@/hooks/use-persisted-activities'
import { useUnits } from '@/hooks/use-units'
import { useStravaAuth } from '@/hooks/use-strava-auth'

const STRAVA_AVAILABLE = !!config.STRAVA_CLIENT_ID

const MapboxHeatmap = dynamic(() => import('@/components/mapbox-heatmap'), {
  ssr: false,
  loading: () => <MapSkeleton />,
})

import type { MapboxHeatmapRef } from '@/components/mapbox-heatmap'

const ExportModal = dynamic(() => import('@/components/export').then((mod) => ({ default: mod.ExportModal })), {
  ssr: false,
})

const ACTIVITY_TYPES = ['cycling', 'hiking', 'running', 'walking']

const Home = () => {
  const { convertDistance, convertElevation, distanceLabel, elevationLabel } = useUnits()

  // Loading state
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Persisted activities from IndexedDB
  const {
    cachedActivities,
    isLoading: isRestoringCache,
    saveActivities: persistActivities,
    clearActivities: clearPersistedActivities,
  } = usePersistedActivities()

  // Data state
  const [allActivities, setAllActivities] = useState<Activity[]>([])

  // Strava auth
  const {
    isConnected: stravaConnected,
    justConnected: stravaJustConnected,
    connect: stravaConnect,
    disconnect: stravaDisconnect,
    getAccessToken,
  } = useStravaAuth()

  // Load cached activities on mount — only restore once, so clearing the cache
  // (e.g. via disconnect) doesn't immediately re-hydrate from stale state.
  const hasRestoredCacheRef = useRef(false)
  useEffect(() => {
    if (hasRestoredCacheRef.current) return
    if (cachedActivities && cachedActivities.length > 0) {
      hasRestoredCacheRef.current = true
      setAllActivities(cachedActivities)
    }
  }, [cachedActivities])

  // Filter state
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<string[]>(ACTIVITY_TYPES)
  const [selectedDate, setSelectedDate] = useState<number>(100) // 0-100 percentage

  // Highlight state
  const [highlightedActivityId, setHighlightedActivityId] = useState<string | null>(null)

  // Filter hover state
  const [hoveredFilterType, setHoveredFilterType] = useState<string | null>(null)

  // Export modal state
  const [exportOpen, setExportOpen] = useState(false)
  const mapRef = useRef<MapboxHeatmapRef>(null)

  // Date range for filter — loop instead of Math.min(...spread) to avoid
  // stack overflow with large activity sets.
  const dateRange = useMemo(() => {
    if (allActivities.length === 0) return null
    let min = Infinity
    let max = -Infinity
    for (const a of allActivities) {
      if (!a.date) continue
      const t = a.date.getTime()
      if (t < min) min = t
      if (t > max) max = t
    }
    if (min === Infinity) return null
    return { min: new Date(min), max: new Date(max) }
  }, [allActivities])

  // Derive filtered activities directly - no state synchronization needed
  const activities = useMemo(() => {
    if (allActivities.length === 0) return []

    const typeSet = new Set(selectedActivityTypes)
    const cutoffTime = dateRange
      ? dateRange.min.getTime() + ((dateRange.max.getTime() - dateRange.min.getTime()) * selectedDate) / 100
      : null

    return allActivities.filter((activity) => {
      if (!typeSet.has(activity.type as string)) return false
      if (cutoffTime !== null && activity.date && activity.date.getTime() > cutoffTime) return false
      return true
    })
  }, [allActivities, selectedActivityTypes, selectedDate, dateRange])

  // Statistics
  const statistics = useStatistics(activities)

  // Initial map position (saved -> geolocation -> latest activity -> default)
  const {
    position: initialMapPosition,
    savePosition,
    isLoading: isMapPositionLoading,
  } = usePersistedMapPosition(allActivities)

  // Activity counts for filter panel — reflect the date-filtered set so counts
  // shrink as the date slider narrows. Stay independent of type selection so
  // toggling a type doesn't make its own count flicker to zero.
  const activityCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const cutoffTime = dateRange
      ? dateRange.min.getTime() + ((dateRange.max.getTime() - dateRange.min.getTime()) * selectedDate) / 100
      : null
    for (const activity of allActivities) {
      if (cutoffTime !== null && activity.date && activity.date.getTime() > cutoffTime) continue
      const type = activity.type || 'unknown'
      counts[type] = (counts[type] || 0) + 1
    }
    return counts
  }, [allActivities, dateRange, selectedDate])

  // Filter activities by hovered type (for preview in activity list)
  const displayedActivities = useMemo(() => {
    if (!hoveredFilterType) return activities
    return activities.filter((a) => a.type === hoveredFilterType)
  }, [activities, hoveredFilterType])

  // Build GeoJSON once from ALL activities — only recomputes on sync.
  // Type/date/hover filtering is handled by Mapbox filter expressions on the GPU.
  const allGeoData = useMemo((): ActivityFeatureCollection => {
    const features = allActivities
      .filter((a) => a.feature)
      .map((activity) => ({
        type: 'Feature' as const,
        geometry: activity.feature!.geometry,
        properties: {
          id: activity.id,
          type: activity.type || 'unknown',
          dateTs: activity.date?.getTime() ?? 0,
        },
      }))

    return {
      type: 'FeatureCollection' as const,
      features,
    }
  }, [allActivities])

  // Date cutoff as timestamp for the map's Mapbox filter expression
  const dateCutoff = useMemo(() => {
    if (!dateRange || selectedDate >= 100) return null
    const timeRange = dateRange.max.getTime() - dateRange.min.getTime()
    return dateRange.min.getTime() + (timeRange * selectedDate) / 100
  }, [dateRange, selectedDate])

  // Sync activities from Strava
  const syncAbortRef = useRef<AbortController | null>(null)
  const handleStravaSync = useCallback(async () => {
    syncAbortRef.current?.abort()
    const controller = new AbortController()
    syncAbortRef.current = controller
    setIsUploading(true)
    setUploadError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setUploadError('Strava session expired. Please reconnect.')
        return
      }
      const fetched = await fetchAllActivities(token, {
        signal: controller.signal,
        onBatch: (batch) => {
          // Progressive: push each page of 200 activities into state immediately
          // so the map renders while remaining pages are still fetching
          setAllActivities((prev) => {
            const existingIds = new Set(prev.map((a) => a.id))
            const fresh = batch.filter((a) => !existingIds.has(a.id))
            if (fresh.length === 0) return prev
            return [...prev, ...fresh].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
          })
        },
      })
      if (controller.signal.aborted) return
      if (fetched.length === 0) {
        setUploadError('No Strava activities found on this account.')
        return
      }
      // Persist final merged set to IndexedDB
      setAllActivities((prev) => {
        persistActivities(prev).catch(() => {
          setUploadError('Activities loaded but failed to save to browser storage.')
        })
        return prev
      })
      setSelectedActivityTypes(ACTIVITY_TYPES)
      setSelectedDate(100)
    } catch (err) {
      if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return
      console.error('Strava sync failed:', err)
      const msg = err instanceof Error ? err.message : 'unknown'
      if (msg === 'strava_unauthorized') {
        setUploadError('Strava authorization expired. Please reconnect.')
        stravaDisconnect()
      } else if (msg === 'strava_rate_limited') {
        setUploadError('Strava rate limit hit. Please try again in 15 minutes.')
      } else {
        setUploadError('Failed to sync from Strava. Please try again.')
      }
    } finally {
      if (syncAbortRef.current === controller) {
        syncAbortRef.current = null
      }
      if (!controller.signal.aborted) {
        setIsUploading(false)
      }
    }
  }, [getAccessToken, persistActivities, stravaDisconnect])

  const handleStravaAbortSync = useCallback(() => {
    syncAbortRef.current?.abort()
    syncAbortRef.current = null
    setIsUploading(false)
    // Persist whatever we fetched so far so a refresh doesn't lose the partial set.
    setAllActivities((prev) => {
      if (prev.length > 0) {
        persistActivities(prev).catch(() => {})
      }
      return prev
    })
  }, [persistActivities])

  const handleStravaDisconnect = useCallback(() => {
    syncAbortRef.current?.abort()
    syncAbortRef.current = null
    stravaDisconnect()
    setAllActivities([])
    setSelectedActivityTypes(ACTIVITY_TYPES)
    setSelectedDate(100)
    setHighlightedActivityId(null)
    setUploadError(null)
    setIsUploading(false)
    clearPersistedActivities()
  }, [stravaDisconnect, clearPersistedActivities])

  // Auto-sync once on mount whenever connected (covers both OAuth return and refresh)
  const hasAutoSyncedRef = useRef(false)
  useEffect(() => {
    if (hasAutoSyncedRef.current) return
    if (stravaConnected || stravaJustConnected) {
      hasAutoSyncedRef.current = true
      handleStravaSync()
    }
  }, [stravaConnected, stravaJustConnected, handleStravaSync])

  // Abort any in-flight sync on unmount (disconnect/abort handlers abort directly).
  useEffect(() => {
    return () => {
      syncAbortRef.current?.abort()
    }
  }, [])

  // Handle activity click - zoom to activity bounds
  const handleActivityClick = (activity: Activity) => {
    setHighlightedActivityId(activity.id)

    // Fit map to activity bounds
    if (activity.feature?.geometry.coordinates) {
      mapRef.current?.fitToBounds(activity.feature.geometry.coordinates as [number, number][])
    }
  }

  // Handle hover - highlight + pan map to activity if it's offscreen.
  // Debounced so dragging the cursor through the list doesn't fire animations
  // for every row that briefly passes under the pointer.
  const hoverPanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activitiesRef = useRef<Activity[]>(activities)
  useEffect(() => {
    activitiesRef.current = activities
  }, [activities])

  const handleActivityHover = useCallback((id: string | null) => {
    setHighlightedActivityId(id)
    if (hoverPanTimeoutRef.current) {
      clearTimeout(hoverPanTimeoutRef.current)
      hoverPanTimeoutRef.current = null
    }
    if (!id) return
    hoverPanTimeoutRef.current = setTimeout(() => {
      const coords = activitiesRef.current.find((a) => a.id === id)?.feature?.geometry.coordinates
      if (coords?.length) {
        mapRef.current?.ensureInView(coords as [number, number][])
      }
    }, 150)
  }, [])

  useEffect(() => {
    return () => {
      if (hoverPanTimeoutRef.current) clearTimeout(hoverPanTimeoutRef.current)
    }
  }, [])

  // Handle keyboard navigation - fly to activity midpoint (lightweight)
  const handleActivityNavigate = useCallback((activity: Activity) => {
    const coords = activity.feature?.geometry.coordinates
    if (coords?.length) {
      const mid = coords[Math.floor(coords.length / 2)] as [number, number]
      mapRef.current?.flyTo({ latitude: mid[1], longitude: mid[0], zoom: 13 })
    }
  }, [])

  // Handle logo click - fly to user's location or latest activity
  const handleLogoClick = useCallback(() => {
    // Try geolocation first
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          mapRef.current?.flyTo({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            zoom: 12,
          })
        },
        () => {
          // Geolocation failed, try latest activity
          const sortedActivities = [...allActivities]
            .filter((a) => a.date && a.feature?.geometry?.coordinates?.length)
            .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))

          const latestActivity = sortedActivities[0]
          if (latestActivity?.feature?.geometry.coordinates.length) {
            const [longitude, latitude] = latestActivity.feature.geometry.coordinates[0]
            mapRef.current?.flyTo({ latitude, longitude, zoom: 12 })
          }
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
      )
    } else {
      // No geolocation, use latest activity
      const sortedActivities = [...allActivities]
        .filter((a) => a.date && a.feature?.geometry?.coordinates?.length)
        .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))

      const latestActivity = sortedActivities[0]
      if (latestActivity?.feature?.geometry.coordinates.length) {
        const [longitude, latitude] = latestActivity.feature.geometry.coordinates[0]
        mapRef.current?.flyTo({ latitude, longitude, zoom: 12 })
      }
    }
  }, [allActivities])

  const hasActivities = allActivities.length > 0 || isRestoringCache

  const handleActivityTypesChange = useCallback((types: string[]) => {
    startTransition(() => {
      setSelectedActivityTypes(types)
    })
  }, [])

  const handleDateChange = useCallback((date: number) => {
    startTransition(() => {
      setSelectedDate(date)
    })
  }, [])

  const filterPanelComponent = (
    <FilterPanel
      activityTypes={ACTIVITY_TYPES}
      selectedActivityTypes={selectedActivityTypes}
      onActivityTypesChange={handleActivityTypesChange}
      activityCounts={activityCounts}
      dateRange={dateRange}
      selectedDate={selectedDate}
      onDateChange={handleDateChange}
      onTypeHover={setHoveredFilterType}
    />
  )

  const activityListComponent = (
    <ActivityList
      activities={displayedActivities}
      highlightedActivityId={highlightedActivityId}
      onActivityHover={handleActivityHover}
      onActivityClick={handleActivityClick}
      onActivityNavigate={handleActivityNavigate}
      loading={isUploading}
      className="flex-1 min-h-0"
      convertDistance={convertDistance}
      convertElevation={convertElevation}
      distanceLabel={distanceLabel}
      elevationLabel={elevationLabel}
    />
  )

  const statsPanelComponent = (
    <StatsPanel
      statistics={statistics}
      loading={isUploading}
      convertDistance={convertDistance}
      convertElevation={convertElevation}
      distanceLabel={distanceLabel}
      elevationLabel={elevationLabel}
    />
  )

  return (
    <AppShell
      header={
        <Header
          onExportClick={() => setExportOpen(true)}
          onLogoClick={handleLogoClick}
          hasActivities={hasActivities}
          stravaAvailable={STRAVA_AVAILABLE}
          stravaConnected={stravaConnected}
          isStravaSyncing={isUploading}
          stravaError={uploadError}
          onStravaConnect={stravaConnect}
          onStravaDisconnect={handleStravaDisconnect}
          onStravaAbortSync={handleStravaAbortSync}
        />
      }
      leftPanels={
        hasActivities ? (
          <>
            {filterPanelComponent}
            {activityListComponent}
          </>
        ) : null
      }
      bottomRightPanel={hasActivities ? statsPanelComponent : null}
      statsPanel={statsPanelComponent}
      filterPanel={filterPanelComponent}
      activityList={activityListComponent}
      hasActivities={hasActivities}
    >
      {isMapPositionLoading ? (
        <MapSkeleton />
      ) : (
        <MapboxHeatmap
          ref={mapRef}
          data={allGeoData}
          highlightedActivityId={highlightedActivityId}
          typeFilter={selectedActivityTypes}
          dateCutoff={dateCutoff}
          hoverType={hoveredFilterType}
          initialPosition={initialMapPosition}
          onPositionChange={savePosition}
        />
      )}

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} mapRef={mapRef} />
    </AppShell>
  )
}

export default Home
