'use client'

import { useCallback, useEffect, useMemo, useState, useRef, startTransition } from 'react'
import dynamic from 'next/dynamic'

import {
  AppShell,
  Header,
  FilterPanel,
  StatsPanel,
  ActivityList,
  MapSkeleton,
} from '@/components/ui'

import { fetchAllActivities } from '@/lib/strava'
import { Activity, ActivityFeatureCollection } from '@/models/activity'
import { useStatistics } from '@/hooks/use-statistics'
import { usePersistedMapPosition } from '@/hooks/use-persisted-map-position'
import { useActivityClusters } from '@/hooks/use-activity-clusters'
import { usePersistedActivities } from '@/hooks/use-persisted-activities'
import { useUnits } from '@/hooks/use-units'
import { useStravaAuth } from '@/hooks/use-strava-auth'

const STRAVA_AVAILABLE = !!process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID

const MapboxHeatmap = dynamic(() => import('@/components/mapbox-heatmap'), {
  ssr: false,
  loading: () => <MapSkeleton />,
})

import type { MapboxHeatmapRef } from '@/components/mapbox-heatmap'

const ExportModal = dynamic(
  () => import('@/components/export').then((mod) => ({ default: mod.ExportModal })),
  {
    ssr: false,
  },
)

const ACTIVITY_TYPES = ['cycling', 'hiking', 'running', 'walking']

const Home = () => {
  const { convertDistance, convertElevation, distanceLabel, elevationLabel } = useUnits()

  // Loading state
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Persisted activities from IndexedDB
  const { cachedActivities, isLoading: isRestoringCache, saveActivities: persistActivities } = usePersistedActivities()

  // Data state
  const [allActivities, setAllActivities] = useState<Activity[]>([])

  // Strava auth
  const { isConnected: stravaConnected, justConnected: stravaJustConnected, connect: stravaConnect, disconnect: stravaDisconnect, getAccessToken } = useStravaAuth()

  // Load cached activities on mount
  useEffect(() => {
    if (cachedActivities && cachedActivities.length > 0 && allActivities.length === 0) {
      setAllActivities(cachedActivities)
    }
  }, [cachedActivities, allActivities.length])

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

  // Location/cluster state
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null)

  // Date range for filter
  const dateRange = useMemo(() => {
    if (allActivities.length === 0) return null
    const dates = allActivities.filter((a) => a.date).map((a) => a.date!.getTime())
    if (dates.length === 0) return null
    return {
      min: new Date(Math.min(...dates)),
      max: new Date(Math.max(...dates)),
    }
  }, [allActivities])

  // Derive filtered activities directly - no state synchronization needed
  const activities = useMemo(() => {
    if (allActivities.length === 0) return []

    return allActivities.filter((activity) => {
      // Filter by type
      if (!selectedActivityTypes.includes(activity.type as string)) {
        return false
      }
      // Filter by date
      if (activity.date && dateRange) {
        const timeRange = dateRange.max.getTime() - dateRange.min.getTime()
        const cutoffTime = dateRange.min.getTime() + (timeRange * selectedDate) / 100
        if (activity.date.getTime() > cutoffTime) {
          return false
        }
      }
      return true
    })
  }, [allActivities, selectedActivityTypes, selectedDate, dateRange])

  // Statistics
  const statistics = useStatistics(activities)

  // Activity clusters for location navigation (uses filtered activities)
  const clusters = useActivityClusters(activities)

  // Export statistics with location name
  const exportStatistics = useMemo(() => {
    // Get location name from selected cluster or primary cluster
    const locationName = selectedClusterId
      ? clusters.find((c) => c.id === selectedClusterId)?.displayName
      : clusters[0]?.displayName
    return {
      ...statistics,
      locationName,
    }
  }, [statistics, clusters, selectedClusterId])

  // Initial map position (saved -> geolocation -> latest activity -> default)
  const { position: initialMapPosition, savePosition, isLoading: isMapPositionLoading } = usePersistedMapPosition(allActivities)

  // Activity counts for filter panel
  const activityCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const activity of allActivities) {
      const type = activity.type || 'unknown'
      counts[type] = (counts[type] || 0) + 1
    }
    return counts
  }, [allActivities])

  // Filter activities by hovered type (for preview)
  const displayedActivities = useMemo(() => {
    if (!hoveredFilterType) return activities
    return activities.filter((a) => a.type === hoveredFilterType)
  }, [activities, hoveredFilterType])

  // Update combined geo data when displayed activities change
  const combinedGeoData = useMemo((): ActivityFeatureCollection => {
    const features = displayedActivities
      .filter((a) => a.feature)
      .map((activity) => ({
        type: 'Feature' as const,
        geometry: activity.feature!.geometry,
        properties: { id: activity.id },
      }))

    return {
      type: 'FeatureCollection' as const,
      features,
    }
  }, [displayedActivities])

  // Sync activities from Strava
  const handleStravaSync = useCallback(async () => {
    setIsUploading(true)
    setUploadError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setUploadError('Strava session expired. Please reconnect.')
        return
      }
      const fetched = await fetchAllActivities(token)
      if (fetched.length === 0) {
        setUploadError('No Strava activities found on this account.')
        return
      }
      setAllActivities((prev) => {
        const existingIds = new Set(prev.map((a) => a.id))
        const fresh = fetched.filter((a) => !existingIds.has(a.id))
        const merged = [...prev, ...fresh].sort(
          (a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)
        )
        persistActivities(merged).catch(() => {
          setUploadError('Activities loaded but failed to save to browser storage.')
        })
        return merged
      })
      setSelectedActivityTypes(ACTIVITY_TYPES)
      setSelectedDate(100)
    } catch (err) {
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
      setIsUploading(false)
    }
  }, [getAccessToken, persistActivities, stravaDisconnect])

  // Auto-sync once on mount whenever connected (covers both OAuth return and refresh)
  const hasAutoSyncedRef = useRef(false)
  useEffect(() => {
    if (hasAutoSyncedRef.current) return
    if (stravaConnected || stravaJustConnected) {
      hasAutoSyncedRef.current = true
      handleStravaSync()
    }
  }, [stravaConnected, stravaJustConnected, handleStravaSync])

  // Handle activity click - zoom to activity bounds
  const handleActivityClick = (activity: Activity) => {
    setHighlightedActivityId(activity.id)

    // Fit map to activity bounds
    if (activity.feature?.geometry.coordinates) {
      mapRef.current?.fitToBounds(activity.feature.geometry.coordinates as [number, number][])
    }
  }

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
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
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

  // Reset cluster selection if selected cluster no longer exists (due to filtering)
  useEffect(() => {
    if (selectedClusterId && !clusters.find((c) => c.id === selectedClusterId)) {
      setSelectedClusterId(null)
    }
  }, [clusters, selectedClusterId])

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
      onActivityHover={setHighlightedActivityId}
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
          onStravaDisconnect={stravaDisconnect}
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
          data={combinedGeoData}
          activities={displayedActivities}
          highlightedActivityId={highlightedActivityId}
          initialPosition={initialMapPosition}
          onPositionChange={savePosition}
        />
      )}

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} mapRef={mapRef} statistics={exportStatistics} />
    </AppShell>
  )
}

export default Home
