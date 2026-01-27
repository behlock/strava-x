'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import MapboxHeatmap from '@/components/mapbox-heatmap'
import {
  TEAppShell,
  TEHeader,
  TEInstructions,
  TEUploadZone,
  TEFilterPanel,
  TEStatsPanel,
  TEActivityList,
  TEHelpModal,
} from '@/components/te-ui'

import { combineFiles } from '@/lib/gps'
import { Activity } from '@/models/activity'
import { useStatistics } from '@/hooks/use-statistics'

const ACTIVITY_TYPES = ['cycling', 'hiking', 'running', 'walking']

const Home = () => {
  // Loading state
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [uploadProgress, setUploadProgress] = useState<{ processed: number; total: number } | null>(null)

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
    const dates = allActivities
      .filter((a) => a.date)
      .map((a) => a.date!.getTime())
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
    [selectedActivityTypes, selectedDate, dateRange]
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
  const combinedGeoData = useMemo(() => {
    const features = displayedActivities
      .filter((a) => a.feature)
      .map((activity) => ({
        type: 'Feature',
        geometry: activity.feature!.geometry,
        properties: { id: activity.id },
      }))

    return {
      type: 'FeatureCollection',
      features,
    }
  }, [displayedActivities])

  // Handle file upload
  const handleFilesSelected = async (files: File[]) => {
    setIsLoading(true)
    setUploadProgress({ processed: 0, total: files.length })

    try {
      const parsedActivities = await combineFiles(files, (processed, total) => {
        setUploadProgress({ processed, total })
      })
      setAllActivities(parsedActivities)
      setSelectedActivityTypes(ACTIVITY_TYPES)
      setSelectedDate(100)
    } catch (error) {
      console.error('Error processing files:', error)
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
    <TEUploadZone
      onFilesSelected={handleFilesSelected}
      isLoading={isLoading}
      progress={uploadProgress}
      hasActivities={hasActivities}
    />
  )

  const filterPanelComponent = (
    <TEFilterPanel
      activityTypes={ACTIVITY_TYPES}
      selectedActivityTypes={selectedActivityTypes}
      onActivityTypesChange={setSelectedActivityTypes}
      activityCounts={activityCounts}
      dateRange={dateRange}
      selectedDate={selectedDate}
      onDateChange={setSelectedDate}
      onTypeHover={setHoveredFilterType}
    />
  )

  const activityListComponent = (
    <TEActivityList
      activities={displayedActivities}
      highlightedActivityId={highlightedActivityId}
      onActivityHover={setHighlightedActivityId}
      onActivityClick={handleActivityClick}
      loading={isLoading}
    />
  )

  const statsPanelComponent = (
    <TEStatsPanel statistics={statistics} loading={isLoading} />
  )

  return (
    <TEAppShell
      header={<TEHeader onHelpClick={() => setHelpOpen(true)} />}
      leftPanels={
        <>
          <TEInstructions />
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
      uploadZone={uploadZoneComponent}
      statsPanel={statsPanelComponent}
      filterPanel={filterPanelComponent}
      activityList={activityListComponent}
      hasActivities={hasActivities}
    >
      <MapboxHeatmap
        data={combinedGeoData}
        activities={displayedActivities}
        highlightedActivityId={highlightedActivityId}
      />

      <TEHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </TEAppShell>
  )
}

export default Home
