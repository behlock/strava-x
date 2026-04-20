'use client'

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react'
import dynamic from 'next/dynamic'

import { AppShell, FilterPanel, StatsPanel, ActivityList, MapSkeleton } from '@/components/ui'
import { Activity, ActivityFeatureCollection } from '@/models/activity'
import { useStatistics } from '@/hooks/use-statistics'
import { usePersistedMapPosition } from '@/hooks/use-persisted-map-position'
import { useUnits } from '@/hooks/use-units'
import { useIsMobile } from '@/hooks/use-media-query'

const MapboxHeatmap = dynamic(() => import('@/components/mapbox-heatmap'), {
  ssr: false,
  loading: () => <MapSkeleton />,
})

import type { MapboxHeatmapRef } from '@/components/mapbox-heatmap'

export { MapboxHeatmapRef }

export const ACTIVITY_TYPES = ['cycling', 'hiking', 'running', 'walking']

export interface MapViewHandles {
  mapRef: React.RefObject<MapboxHeatmapRef | null>
  flyToLatestActivity: () => void
}

interface MapViewProps {
  activities: Activity[]
  /** When true, show list/stats loading states (used during initial sync). */
  loading?: boolean
  /**
   * Header slot — can be a ReactNode or a renderer that receives map handles
   * so the header can wire its own logo-click / export buttons into the map.
   */
  header: ReactNode | ((handles: MapViewHandles) => ReactNode)
  /**
   * Extra overlays rendered inside the AppShell body alongside the map
   * (e.g. modals that need access to the map ref). Can be a ReactNode or a
   * renderer that receives the same handles the header gets.
   */
  overlays?: ReactNode | ((handles: MapViewHandles) => ReactNode)
  /** Fallback rendered in place of panels when there are no activities yet. */
  emptyState?: ReactNode
  /**
   * Optional external ref for the underlying map. Pass this in when another
   * part of the page (e.g. an export modal) needs direct access to the map
   * canvas — MapView will populate it with the same handle it uses internally.
   */
  externalMapRef?: React.RefObject<MapboxHeatmapRef | null>
}

export function MapView({
  activities: allActivities,
  loading = false,
  header,
  overlays,
  emptyState,
  externalMapRef,
}: MapViewProps) {
  const { convertDistance, convertElevation, distanceLabel, elevationLabel } = useUnits()

  const [selectedActivityTypes, setSelectedActivityTypes] = useState<string[]>(ACTIVITY_TYPES)
  const [selectedDate, setSelectedDate] = useState<number>(100)
  const [highlightedActivityId, setHighlightedActivityId] = useState<string | null>(null)
  const [hoveredFilterType, setHoveredFilterType] = useState<string | null>(null)

  const isMobile = useIsMobile()
  const drawerHeightRef = useRef(0)

  const handleDrawerHeightChange = useCallback((height: number) => {
    drawerHeightRef.current = height
  }, [])

  const computePadding = useCallback(() => {
    if (!isMobile) {
      return { top: 80, bottom: 80, left: 100, right: 80 }
    }
    return {
      top: 80,
      bottom: Math.round(drawerHeightRef.current) + 20,
      left: 40,
      right: 40,
    }
  }, [isMobile])

  const mapRef = useRef<MapboxHeatmapRef | null>(null)

  // Keep externalMapRef in sync so other parts of the page (e.g. an export
  // modal) see the same underlying map handle.
  const setMapRef = useCallback(
    (instance: MapboxHeatmapRef | null) => {
      mapRef.current = instance
      if (externalMapRef) externalMapRef.current = instance
    },
    [externalMapRef],
  )

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

  const cutoffTime = useMemo(() => {
    if (!dateRange) return null
    return dateRange.min.getTime() + ((dateRange.max.getTime() - dateRange.min.getTime()) * selectedDate) / 100
  }, [dateRange, selectedDate])

  const activities = useMemo(() => {
    if (allActivities.length === 0) return []
    const typeSet = new Set(selectedActivityTypes)
    return allActivities.filter((activity) => {
      if (!typeSet.has(activity.type as string)) return false
      if (cutoffTime !== null && activity.date && activity.date.getTime() > cutoffTime) return false
      return true
    })
  }, [allActivities, selectedActivityTypes, cutoffTime])

  const statistics = useStatistics(activities)

  const {
    position: initialMapPosition,
    savePosition,
    isLoading: isMapPositionLoading,
  } = usePersistedMapPosition(allActivities)

  const activityCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const activity of allActivities) {
      if (cutoffTime !== null && activity.date && activity.date.getTime() > cutoffTime) continue
      const type = activity.type || 'unknown'
      counts[type] = (counts[type] || 0) + 1
    }
    return counts
  }, [allActivities, cutoffTime])

  const displayedActivities = useMemo(() => {
    if (!hoveredFilterType) return activities
    return activities.filter((a) => a.type === hoveredFilterType)
  }, [activities, hoveredFilterType])

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

  const dateCutoff = selectedDate >= 100 ? null : cutoffTime

  const handleActivityClick = useCallback(
    (activity: Activity) => {
      setHighlightedActivityId(activity.id)
      if (activity.feature?.geometry.coordinates) {
        mapRef.current?.fitToBounds(activity.feature.geometry.coordinates as [number, number][], {
          padding: computePadding(),
        })
      }
    },
    [computePadding],
  )

  const hoverPanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activitiesRef = useRef<Activity[]>(activities)
  useEffect(() => {
    activitiesRef.current = activities
  }, [activities])

  const handleActivityHover = useCallback(
    (id: string | null) => {
      setHighlightedActivityId(id)
      if (hoverPanTimeoutRef.current) {
        clearTimeout(hoverPanTimeoutRef.current)
        hoverPanTimeoutRef.current = null
      }
      if (!id) return
      hoverPanTimeoutRef.current = setTimeout(() => {
        const coords = activitiesRef.current.find((a) => a.id === id)?.feature?.geometry.coordinates
        if (coords?.length) {
          mapRef.current?.ensureInView(coords as [number, number][], { padding: computePadding() })
        }
      }, 150)
    },
    [computePadding],
  )

  useEffect(() => {
    return () => {
      if (hoverPanTimeoutRef.current) clearTimeout(hoverPanTimeoutRef.current)
    }
  }, [])

  const handleActivityNavigate = useCallback((activity: Activity) => {
    const coords = activity.feature?.geometry.coordinates
    if (coords?.length) {
      const mid = coords[Math.floor(coords.length / 2)] as [number, number]
      mapRef.current?.flyTo({ latitude: mid[1], longitude: mid[0], zoom: 13 })
    }
  }, [])

  const flyToLatestActivity = useCallback(() => {
    const latestActivity = allActivities
      .filter((a) => a.date && a.feature?.geometry?.coordinates?.length)
      .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))[0]
    if (latestActivity?.feature?.geometry.coordinates.length) {
      const [longitude, latitude] = latestActivity.feature.geometry.coordinates[0]
      mapRef.current?.flyTo({ latitude, longitude, zoom: 12 })
    }
  }, [allActivities])

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

  const hasActivities = allActivities.length > 0

  const handles: MapViewHandles = useMemo(() => ({ mapRef, flyToLatestActivity }), [flyToLatestActivity])

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
      loading={loading}
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
      loading={loading}
      convertDistance={convertDistance}
      convertElevation={convertElevation}
      distanceLabel={distanceLabel}
      elevationLabel={elevationLabel}
    />
  )

  const resolvedHeader = typeof header === 'function' ? header(handles) : header
  const resolvedOverlays = typeof overlays === 'function' ? overlays(handles) : overlays

  return (
    <AppShell
      header={resolvedHeader}
      leftPanels={
        hasActivities ? (
          <>
            {filterPanelComponent}
            {activityListComponent}
          </>
        ) : (
          (emptyState ?? null)
        )
      }
      bottomRightPanel={hasActivities ? statsPanelComponent : null}
      statsPanel={statsPanelComponent}
      filterPanel={filterPanelComponent}
      activityList={activityListComponent}
      hasActivities={hasActivities}
      onDrawerHeightChange={handleDrawerHeightChange}
    >
      {isMapPositionLoading ? (
        <MapSkeleton />
      ) : (
        <MapboxHeatmap
          ref={setMapRef}
          data={allGeoData}
          highlightedActivityId={highlightedActivityId}
          typeFilter={selectedActivityTypes}
          dateCutoff={dateCutoff}
          hoverType={hoveredFilterType}
          initialPosition={initialMapPosition}
          onPositionChange={savePosition}
        />
      )}
      {resolvedOverlays}
    </AppShell>
  )
}
