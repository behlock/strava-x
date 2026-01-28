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

  // Statistics
  const statistics = useStatistics(activities)

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

  // Handle activity click - could zoom to activity bounds
  const handleActivityClick = (activity: Activity) => {
    setHighlightedActivityId(activity.id)
  }

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
      header={<Header onHelpClick={() => setHelpOpen(true)} onExportClick={() => setExportOpen(true)} hasActivities={hasActivities} />}
      leftPanels={
        <>
          <Instructions />
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
      instructions={<Instructions />}
      uploadZone={uploadZoneComponent}
      statsPanel={statsPanelComponent}
      filterPanel={filterPanelComponent}
      activityList={activityListComponent}
      hasActivities={hasActivities}
    >
      <MapboxHeatmap
        ref={mapRef}
        data={combinedGeoData}
        activities={displayedActivities}
        highlightedActivityId={highlightedActivityId}
      />

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} mapRef={mapRef} />
    </AppShell>
  )
}

export default Home
