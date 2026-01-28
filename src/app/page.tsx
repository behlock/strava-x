'use client'

import { useCallback, useEffect, useMemo, useState, useRef, startTransition } from 'react'
import dynamic from 'next/dynamic'

import {
  AppShell,
  Header,
  Instructions,
  UploadZone,
  FilterPanel,
  StatsPanel,
  ActivityList,
  MapSkeleton,
} from '@/components/ui'

import { combineFiles } from '@/lib/gps'
import { Activity, ActivityFeatureCollection } from '@/models/activity'
import { useStatistics } from '@/hooks/use-statistics'
import { usePersistedMapPosition } from '@/hooks/use-persisted-map-position'
import { useActivityClusters } from '@/hooks/use-activity-clusters'

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

const HelpModal = dynamic(
  () => import('@/components/ui/help-modal').then((mod) => ({ default: mod.HelpModal })),
  {
    ssr: false,
  },
)

const ACTIVITY_TYPES = ['cycling', 'hiking', 'running', 'walking']

const Home = () => {
  // Loading state
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [uploadProgress, setUploadProgress] = useState<{ processed: number; total: number } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Data state
  const [allActivities, setAllActivities] = useState<Activity[]>([])
  const [activities, setActivities] = useState<Activity[]>([])

  // Filter state
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<string[]>(ACTIVITY_TYPES)
  const [selectedDate, setSelectedDate] = useState<number>(100) // 0-100 percentage

  // Highlight state
  const [highlightedActivityId, setHighlightedActivityId] = useState<string | null>(null)

  // Filter hover state
  const [hoveredFilterType, setHoveredFilterType] = useState<string | null>(null)

  // Help modal state
  const [helpOpen, setHelpOpen] = useState(false)

  // Export modal state
  const [exportOpen, setExportOpen] = useState(false)
  const mapRef = useRef<MapboxHeatmapRef>(null)

  // Location/cluster state
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null)

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

  // Filter activities when filter values change
  const filterActivities = useCallback(
    (activities: Activity[]) => {
      return activities.filter((activity) => {
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
    },
    [selectedActivityTypes, selectedDate, dateRange],
  )

  // Update activities when all activities change
  useEffect(() => {
    if (allActivities.length > 0) {
      setActivities(filterActivities(allActivities))
    }
  }, [allActivities, filterActivities])

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

  // Handle file upload
  const handleFilesSelected = async (files: File[]) => {
    setIsLoading(true)
    setUploadError(null)
    setUploadProgress({ processed: 0, total: files.length })

    try {
      const parsedActivities = await combineFiles(files, (processed, total) => {
        setUploadProgress({ processed, total })
      })
      if (parsedActivities.length === 0) {
        setUploadError('No valid activity files found. Please select a folder containing .gpx or .fit files.')
      } else {
        setAllActivities(parsedActivities)
        setSelectedActivityTypes(ACTIVITY_TYPES)
        setSelectedDate(100)
      }
    } catch (error) {
      console.error('Error processing files:', error)
      setUploadError(error instanceof Error ? error.message : 'Failed to process files. Please try again.')
    } finally {
      setIsLoading(false)
      setUploadProgress(null)
    }
  }

  // Handle activity click - zoom to activity bounds
  const handleActivityClick = (activity: Activity) => {
    setHighlightedActivityId(activity.id)

    // Fit map to activity bounds
    if (activity.feature?.geometry.coordinates) {
      mapRef.current?.fitToBounds(activity.feature.geometry.coordinates as [number, number][])
    }
  }

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

  // Handle cluster selection - zoom to cluster bounds (uses filtered activities)
  const handleClusterSelect = useCallback((clusterId: string | null) => {
    setSelectedClusterId(clusterId)

    if (clusterId === null) {
      // "All" selected - fit to filtered activities
      const allCoords: [number, number][] = []
      for (const activity of activities) {
        const coords = activity.feature?.geometry.coordinates
        if (coords) {
          allCoords.push(...(coords as [number, number][]))
        }
      }
      if (allCoords.length > 0) {
        mapRef.current?.fitToBounds(allCoords)
      }
    } else {
      const cluster = clusters.find((c) => c.id === clusterId)
      if (cluster) {
        // Collect all coordinates from filtered activities in this cluster
        const clusterCoords: [number, number][] = []
        const activityIdSet = new Set(cluster.activityIds)
        for (const activity of activities) {
          if (activityIdSet.has(activity.id)) {
            const coords = activity.feature?.geometry.coordinates
            if (coords) {
              clusterCoords.push(...(coords as [number, number][]))
            }
          }
        }
        if (clusterCoords.length > 0) {
          mapRef.current?.fitToBounds(clusterCoords)
        }
      }
    }
  }, [activities, clusters])

  // Reset cluster selection if selected cluster no longer exists (due to filtering)
  useEffect(() => {
    if (selectedClusterId && !clusters.find((c) => c.id === selectedClusterId)) {
      setSelectedClusterId(null)
    }
  }, [clusters, selectedClusterId])

  const hasActivities = allActivities.length > 0

  // Reusable panel components for both desktop and mobile
  const uploadZoneComponent = (
    <UploadZone
      onFilesSelected={handleFilesSelected}
      isLoading={isLoading}
      progress={uploadProgress}
      hasActivities={hasActivities}
      error={uploadError}
      onErrorDismiss={() => setUploadError(null)}
      defaultExpanded={!hasActivities}
    />
  )

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
      clusters={clusters}
      selectedClusterId={selectedClusterId}
      onClusterSelect={handleClusterSelect}
    />
  )

  const activityListComponent = (
    <ActivityList
      activities={displayedActivities}
      highlightedActivityId={highlightedActivityId}
      onActivityHover={setHighlightedActivityId}
      onActivityClick={handleActivityClick}
      loading={isLoading}
    />
  )

  const statsPanelComponent = <StatsPanel statistics={statistics} loading={isLoading} />

  return (
    <AppShell
      header={
        <Header
          onHelpClick={() => setHelpOpen(true)}
          onExportClick={() => setExportOpen(true)}
          onLogoClick={handleLogoClick}
          hasActivities={hasActivities}
        />
      }
      leftPanels={
        <>
          <Instructions defaultExpanded={!hasActivities} />
          {uploadZoneComponent}
          {hasActivities && (
            <>
              {filterPanelComponent}
              {activityListComponent}
            </>
          )}
        </>
      }
      bottomRightPanel={hasActivities ? statsPanelComponent : null}
      // Mobile-specific props
      instructions={<Instructions defaultExpanded={!hasActivities} />}
      uploadZone={uploadZoneComponent}
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

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} mapRef={mapRef} statistics={exportStatistics} />
    </AppShell>
  )
}

export default Home
