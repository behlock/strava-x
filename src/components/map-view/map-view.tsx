'use client'

import { type ReactNode, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

import { ACTIVITY_TYPES, type Activity, type ActivityFeatureCollection } from '@/models/activity'
import type { LngLat } from '@/models/map'
import { activitiesToGeoData } from '@/lib/activities'
import { config } from '@/lib/config'
import type { ActivityMapRef } from '@/components/activity-map'
import { ActivityList, AppShell, FilterPanel, LocationSelector, MapSkeleton, TimelinePanel } from '@/components/ui'
import { useActivityClusters } from '@/hooks/use-activity-clusters'
import type { CommonRoutesState } from '@/hooks/use-common-routes'
import type { ComparisonAppearance } from '@/lib/comparison-appearance'
import { useRouteHeatmap } from '@/hooks/use-route-heatmap'
import { usePersonalMapAppearance } from '@/hooks/use-map-appearance'
import { CommonRoutesNotice, PersonalMapAppearance } from '@/components/ui/map-appearance-controls'
import { useIsMobile } from '@/hooks/use-media-query'
import { type MapPositionMode, usePersistedMapPosition } from '@/hooks/use-persisted-map-position'

const ActivityMap = dynamic(() => import('@/components/activity-map').then((mod) => mod.ActivityMap), {
  ssr: false,
  loading: () => <MapSkeleton />,
})

interface MapViewProps {
  activities: Activity[]
  /** Show activity list loading states (used during initial sync). */
  loading?: boolean
  /** Frame the complete library’s busiest area instead of restoring an old viewport. */
  preferBusiestArea?: boolean
  header: ReactNode
  /** Extra overlays (modals) rendered on top of the map. */
  overlays?: ReactNode
  /**
   * Populated with the map handle so other parts of the page (e.g. the
   * logo button) can drive the map directly.
   */
  externalMapRef?: React.RefObject<ActivityMapRef | null>
  /**
   * "own" persists pan/zoom to localStorage and restores it on revisits.
   * "public" never touches that cache and always frames the busiest cluster.
   */
  mode?: MapPositionMode
  commonRoutes?: CommonRoutesState | null
  comparisonAppearance?: ComparisonAppearance
  onComparisonRetry?: () => void
}

const DESKTOP_PADDING = { top: 80, bottom: 80, left: 100, right: 80 }
const MOBILE_PADDING_TOP = 80
const MOBILE_MAX_BOTTOM_RATIO = 0.4
const MOBILE_MAX_VERTICAL_RATIO = 0.8
const EMPTY_ROUTES: ActivityFeatureCollection = { type: 'FeatureCollection', features: [] }

export function MapView({
  activities: allActivities,
  loading = false,
  preferBusiestArea = false,
  header,
  overlays,
  externalMapRef,
  mode = 'own',
  commonRoutes,
  comparisonAppearance,
  onComparisonRetry,
}: MapViewProps) {
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<string[]>([...ACTIVITY_TYPES])
  const [selectedDate, setSelectedDate] = useState(100)
  const [highlightedActivityId, setHighlightedActivityId] = useState<string | null>(null)
  const [hoveredFilterType, setHoveredFilterType] = useState<string | null>(null)

  const mapRef = useRef<ActivityMapRef | null>(null)
  const setMapRef = useCallback(
    (instance: ActivityMapRef | null) => {
      mapRef.current = instance
      if (externalMapRef) externalMapRef.current = instance
    },
    [externalMapRef],
  )

  // On mobile the bottom drawer covers part of the map; pad fits accordingly.
  const isMobile = useIsMobile()
  const drawerHeightRef = useRef(0)
  const handleDrawerHeightChange = useCallback((height: number) => {
    drawerHeightRef.current = height
  }, [])
  // The expanded drawer can cover most of a phone screen, so its height is
  // clamped: the bottom pad never exceeds 40% of the viewport, and top plus
  // bottom never exceed 80%, leaving room for the fit itself.
  const computePadding = useCallback(() => {
    if (!isMobile) return DESKTOP_PADDING
    const viewportHeight = window.innerHeight
    const bottom = Math.min(
      Math.round(drawerHeightRef.current) + 20,
      Math.round(viewportHeight * MOBILE_MAX_BOTTOM_RATIO),
      Math.round(viewportHeight * MOBILE_MAX_VERTICAL_RATIO) - MOBILE_PADDING_TOP,
    )
    return { top: MOBILE_PADDING_TOP, bottom: Math.max(0, bottom), left: 40, right: 40 }
  }, [isMobile])

  const dateRange = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const a of allActivities) {
      if (!a.date) continue
      const t = a.date.getTime()
      if (t < min) min = t
      if (t > max) max = t
    }
    return min === Infinity ? null : { min: new Date(min), max: new Date(max) }
  }, [allActivities])

  const cutoffTime = useMemo(() => {
    if (!dateRange || selectedDate >= 100) return null
    return dateRange.min.getTime() + ((dateRange.max.getTime() - dateRange.min.getTime()) * selectedDate) / 100
  }, [dateRange, selectedDate])

  const isBeforeCutoff = useCallback(
    (a: Activity) => cutoffTime === null || !a.date || a.date.getTime() <= cutoffTime,
    [cutoffTime],
  )

  const activities = useMemo(() => {
    const typeSet = new Set(selectedActivityTypes)
    return allActivities.filter((a) => a.type !== null && typeSet.has(a.type) && isBeforeCutoff(a))
  }, [allActivities, selectedActivityTypes, isBeforeCutoff])

  const activityCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of allActivities) {
      if (!isBeforeCutoff(a)) continue
      const type = a.type || 'unknown'
      counts[type] = (counts[type] ?? 0) + 1
    }
    return counts
  }, [allActivities, isBeforeCutoff])

  const {
    position: initialMapPosition,
    initialBounds,
    savePosition,
  } = usePersistedMapPosition(preferBusiestArea && loading ? [] : allActivities, mode, preferBusiestArea)

  const allGeoData = useMemo(() => activitiesToGeoData(allActivities), [allActivities])

  const handleActivityClick = useCallback(
    (activity: Activity) => {
      setHighlightedActivityId(activity.id)
      const coords = activity.feature?.geometry.coordinates as LngLat[] | undefined
      if (coords?.length) mapRef.current?.fitToBounds(coords, { padding: computePadding() })
    },
    [computePadding],
  )

  // Hovering a row pans the map to it, debounced so scrolling the list
  // doesn't thrash the camera.
  const hoverPanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleActivityHover = useCallback(
    (id: string | null) => {
      setHighlightedActivityId(id)
      if (hoverPanTimeoutRef.current) clearTimeout(hoverPanTimeoutRef.current)
      if (!id) return
      hoverPanTimeoutRef.current = setTimeout(() => {
        const coords = allActivities.find((a) => a.id === id)?.feature?.geometry.coordinates as LngLat[] | undefined
        if (coords?.length) mapRef.current?.ensureInView(coords, { padding: computePadding() })
      }, 150)
    },
    [allActivities, computePadding],
  )
  useEffect(() => {
    return () => {
      if (hoverPanTimeoutRef.current) clearTimeout(hoverPanTimeoutRef.current)
    }
  }, [])

  const handleActivityNavigate = useCallback((activity: Activity) => {
    const coords = activity.feature?.geometry.coordinates
    if (!coords?.length) return
    const [longitude, latitude] = coords[Math.floor(coords.length / 2)]
    mapRef.current?.flyTo({ latitude, longitude, zoom: 13 })
  }, [])

  // Filter changes re-render a large list and the map source; keep the
  // controls responsive by marking them as transitions.
  const handleActivityTypesChange = useCallback((types: string[]) => {
    startTransition(() => setSelectedActivityTypes(types))
  }, [])
  const handleDateChange = useCallback((date: number) => {
    startTransition(() => setSelectedDate(date))
  }, [])

  const clusters = useActivityClusters(allActivities, activities)
  const [selectedLocation, setSelectedLocation] = useState<{ id: string; activityIds: string[] } | null>(null)
  const selectedCluster =
    clusters.find((cluster) => cluster.id === selectedLocation?.id) ??
    (selectedLocation
      ? clusters.find((cluster) => cluster.activityIds.some((id) => selectedLocation.activityIds.includes(id)))
      : undefined)
  // Retain the selected scope if the date/type filters temporarily remove its cluster.
  const selectedActivityIds = useMemo(
    () => (selectedLocation ? new Set((selectedCluster ?? selectedLocation).activityIds) : null),
    [selectedCluster, selectedLocation],
  )
  const displayedActivities = useMemo(
    () =>
      activities.filter(
        (activity) =>
          (!selectedActivityIds || selectedActivityIds.has(activity.id)) &&
          (!hoveredFilterType || activity.type === hoveredFilterType),
      ),
    [activities, selectedActivityIds, hoveredFilterType],
  )

  const handleClusterSelect = useCallback(
    (id: string | null, toggle = false) => {
      setHighlightedActivityId(null)
      if (hoverPanTimeoutRef.current) clearTimeout(hoverPanTimeoutRef.current)
      if (id === null || (toggle && (selectedCluster?.id ?? selectedLocation?.id) === id)) {
        setSelectedLocation(null)
        return
      }
      const target = clusters.find((c) => c.id === id)
      if (!target) return
      setSelectedLocation({ id, activityIds: target.activityIds })
      const { minLng, minLat, maxLng, maxLat } = target.bounds
      mapRef.current?.fitToBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: computePadding() },
      )
    },
    [clusters, computePadding, selectedLocation, selectedCluster],
  )

  const hasActivities = allActivities.length > 0
  const personalAppearance = usePersonalMapAppearance()
  const personalStyleEnabled = mode === 'own' && !commonRoutes
  const personalExperiment = config.MAP_STYLE_DEBUG && personalStyleEnabled && hasActivities
  const renderMode = personalStyleEnabled ? personalAppearance.renderMode : comparisonAppearance?.renderMode
  const commonData = commonRoutes?.status === 'ready' ? commonRoutes.data : undefined
  const heatmapSources = useMemo(
    () =>
      commonRoutes?.status === 'ready'
        ? {
            own: commonRoutes.ownRoutes,
            other: allGeoData,
            overlap: commonRoutes.data,
          }
        : personalExperiment
          ? { own: allGeoData, other: EMPTY_ROUTES, overlap: EMPTY_ROUTES }
          : null,
    [commonRoutes, allGeoData, personalExperiment],
  )
  const heatmap = useRouteHeatmap(heatmapSources, renderMode === 'hotspots')
  const heatmapStatus = renderMode === 'hotspots' ? (heatmap.loading ? 'building hotspots…' : heatmap.error) : undefined

  return (
    <AppShell
      header={header}
      hasActivities={hasActivities}
      filterPanel={
        <FilterPanel
          activityTypes={ACTIVITY_TYPES}
          selectedActivityTypes={selectedActivityTypes}
          onActivityTypesChange={handleActivityTypesChange}
          activityCounts={activityCounts}
          onTypeHover={setHoveredFilterType}
        />
      }
      timelinePanel={
        dateRange ? (
          <TimelinePanel
            key={`${dateRange.min.getTime()}-${dateRange.max.getTime()}`}
            dateRange={dateRange}
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
          />
        ) : null
      }
      locationsPanel={
        clusters.length > 0 || selectedLocation ? (
          <LocationSelector
            clusters={clusters}
            totalActivityCount={activities.length}
            selectedClusterId={selectedCluster?.id ?? selectedLocation?.id ?? null}
            onClusterSelect={handleClusterSelect}
          />
        ) : null
      }
      activityList={
        <ActivityList
          activities={displayedActivities}
          highlightedActivityId={highlightedActivityId}
          onActivityHover={handleActivityHover}
          onActivityClick={handleActivityClick}
          onActivityNavigate={handleActivityNavigate}
          loading={loading && allActivities.length === 0}
        />
      }
      onDrawerHeightChange={handleDrawerHeightChange}
      onSidebarVisibilityChange={(visible) => {
        if (!visible) {
          setHighlightedActivityId(null)
          setHoveredFilterType(null)
          if (hoverPanTimeoutRef.current) clearTimeout(hoverPanTimeoutRef.current)
        }
      }}
    >
      <ActivityMap
        ref={setMapRef}
        data={allGeoData}
        commonRoutes={commonData}
        ownRoutes={commonRoutes?.status === 'ready' ? commonRoutes.ownRoutes : undefined}
        comparisonPaletteId={comparisonAppearance?.paletteId}
        comparisonRenderMode={comparisonAppearance?.renderMode}
        personalAppearance={personalStyleEnabled ? personalAppearance : undefined}
        heatmaps={heatmap.data}
        highlightedActivityId={highlightedActivityId}
        typeFilter={selectedActivityTypes}
        dateCutoff={cutoffTime}
        hoverType={hoveredFilterType}
        initialPosition={initialMapPosition}
        initialBounds={initialBounds}
        onPositionChange={savePosition}
      />
      {commonRoutes && onComparisonRetry && (
        <CommonRoutesNotice
          state={commonRoutes}
          appearance={comparisonAppearance}
          heatmapStatus={heatmapStatus}
          onRetry={onComparisonRetry}
        />
      )}
      {personalExperiment && <PersonalMapAppearance appearance={personalAppearance} status={heatmapStatus} />}
      {overlays}
    </AppShell>
  )
}
