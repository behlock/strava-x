'use client'

import { type ReactNode, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

import { ACTIVITY_TYPES, type Activity, type ActivityFeatureCollection } from '@/models/activity'
import type { LngLat } from '@/models/map'
import type { ActivityMapRef } from '@/components/activity-map'
import {
  ActivityList,
  AppShell,
  FilterPanel,
  LocateControl,
  LocationSelector,
  MapSkeleton,
  StatsPanel,
} from '@/components/ui'
import { locateUser } from '@/lib/geolocation'
import { useActivityClusters } from '@/hooks/use-activity-clusters'
import { useIsMobile } from '@/hooks/use-media-query'
import { type MapPositionMode, usePersistedMapPosition } from '@/hooks/use-persisted-map-position'
import { useStatistics } from '@/hooks/use-statistics'

const ActivityMap = dynamic(() => import('@/components/activity-map').then((mod) => mod.ActivityMap), {
  ssr: false,
  loading: () => <MapSkeleton />,
})

interface MapViewProps {
  activities: Activity[]
  /** Show list/stats loading states (used during initial sync). */
  loading?: boolean
  header: ReactNode
  /** Settings panel (theme, account) shown alongside the map panels. */
  setupPanel?: ReactNode
  /** Extra overlays (modals) rendered on top of the map. */
  overlays?: ReactNode
  /**
   * Populated with the map handle so other parts of the page (e.g. the
   * export modal) can drive the map directly.
   */
  externalMapRef?: React.RefObject<ActivityMapRef | null>
  /**
   * "own" persists pan/zoom to localStorage and restores it on revisits.
   * "public" never touches that cache and always frames the busiest cluster.
   */
  mode?: MapPositionMode
}

const DESKTOP_PADDING = { top: 80, bottom: 80, left: 100, right: 80 }
const MOBILE_PADDING_TOP = 80
const MOBILE_MAX_BOTTOM_RATIO = 0.4
const MOBILE_MAX_VERTICAL_RATIO = 0.8

export function MapView({
  activities: allActivities,
  loading = false,
  header,
  setupPanel,
  overlays,
  externalMapRef,
  mode = 'own',
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

  const displayedActivities = useMemo(
    () => (hoveredFilterType ? activities.filter((a) => a.type === hoveredFilterType) : activities),
    [activities, hoveredFilterType],
  )

  const statistics = useStatistics(activities)
  const { position: initialMapPosition, initialBounds, savePosition } = usePersistedMapPosition(allActivities, mode)

  const allGeoData = useMemo(
    (): ActivityFeatureCollection => ({
      type: 'FeatureCollection',
      features: allActivities.flatMap((a) =>
        a.feature
          ? [
              {
                type: 'Feature' as const,
                geometry: a.feature.geometry,
                properties: { id: a.id, type: a.type || 'unknown', dateTs: a.date?.getTime() ?? 0 },
              },
            ]
          : [],
      ),
    }),
    [allActivities],
  )

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

  const clusters = useActivityClusters(activities)
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null)
  // Fall back to the busiest cluster whenever the selection is filtered away.
  const activeClusterId = clusters.some((c) => c.id === selectedClusterId)
    ? selectedClusterId
    : (clusters[0]?.id ?? null)

  const handleClusterSelect = useCallback(
    (id: string) => {
      const target = clusters.find((c) => c.id === id)
      if (!target) return
      setSelectedClusterId(id)
      const { minLng, minLat, maxLng, maxLat } = target.bounds
      mapRef.current?.fitToBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: computePadding() },
      )
    },
    [clusters, computePadding],
  )

  const handleLocate = useCallback(() => {
    locateUser((position) => mapRef.current?.flyTo({ ...position, zoom: 12 }))
  }, [])

  const hasActivities = allActivities.length > 0

  return (
    <AppShell
      header={header}
      hasActivities={hasActivities}
      mapControls={<LocateControl onClick={handleLocate} />}
      setupPanel={setupPanel}
      filterPanel={
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
      }
      locationsPanel={
        clusters.length > 0 ? (
          <LocationSelector
            clusters={clusters}
            selectedClusterId={activeClusterId}
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
          loading={loading}
        />
      }
      statsPanel={<StatsPanel statistics={statistics} loading={loading} />}
      onDrawerHeightChange={handleDrawerHeightChange}
    >
      <ActivityMap
        ref={setMapRef}
        data={allGeoData}
        highlightedActivityId={highlightedActivityId}
        typeFilter={selectedActivityTypes}
        dateCutoff={cutoffTime}
        hoverType={hoveredFilterType}
        initialPosition={initialMapPosition}
        initialBounds={initialBounds}
        onPositionChange={savePosition}
      />
      {overlays}
    </AppShell>
  )
}
