'use client'

import 'mapbox-gl/dist/mapbox-gl.css'

import type mapboxgl from 'mapbox-gl'
import { type Ref, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { Layer, Map, type MapRef, Source, type ViewStateChangeEvent } from 'react-map-gl/mapbox'
import { useTheme } from 'next-themes'

import type { ActivityFeatureCollection } from '@/models/activity'
import type { LngLat, MapBounds, MapPosition } from '@/models/map'
import { ACTIVITY_TYPE_COLORS, DEFAULT_ACTIVITY_COLOR } from '@/lib/activity-colors'
import { config } from '@/lib/config'
import { boundsOf } from '@/lib/geo-utils'
import { applyMapTheme } from '@/lib/map-theme'

interface FitOptions {
  padding?: mapboxgl.PaddingOptions
}

export interface ActivityMapRef {
  /** Frame the given coordinates. */
  fitToBounds: (coordinates: LngLat[], options?: FitOptions) => void
  flyTo: (position: { latitude: number; longitude: number; zoom?: number }) => void
  /** Frame the coordinates only if none of them are currently on screen. */
  ensureInView: (coordinates: LngLat[], options?: FitOptions) => void
}

interface ActivityMapProps {
  ref?: Ref<ActivityMapRef>
  data: ActivityFeatureCollection
  highlightedActivityId: string | null
  typeFilter: string[]
  /** Unix ms timestamp; `null` disables the date filter. */
  dateCutoff: number | null
  hoverType: string | null
  initialPosition: MapPosition
  /**
   * Bounds to frame once. The map renders at `initialPosition` (so the
   * canvas isn't blank) and snaps to these as soon as both Mapbox has loaded
   * and the bounds are known — activities may arrive after load (IndexedDB
   * restore, first sync, public blob fetch). Never applied once the user has
   * panned or zoomed the map themselves.
   */
  initialBounds: MapBounds | null
  onPositionChange: (position: MapPosition) => void
}

const DEFAULT_PADDING: mapboxgl.PaddingOptions = { top: 80, bottom: 80, left: 100, right: 80 }
const LINE_LAYOUT = { 'line-join': 'round', 'line-cap': 'round' } as const

const HIGHLIGHT_COLOR: mapboxgl.ExpressionSpecification = [
  'match',
  ['get', 'type'],
  ...Object.entries(ACTIVITY_TYPE_COLORS).flat(),
  DEFAULT_ACTIVITY_COLOR,
] as mapboxgl.ExpressionSpecification

function visibilityConditions(typeFilter: string[], dateCutoff: number | null): mapboxgl.FilterSpecification[] {
  const conditions: mapboxgl.FilterSpecification[] = [['in', ['get', 'type'], ['literal', typeFilter]]]
  if (dateCutoff !== null) conditions.push(['<=', ['get', 'dateTs'], dateCutoff])
  return conditions
}

function intersectsView(bounds: MapBounds, view: mapboxgl.LngLatBounds): boolean {
  const [[west, south], [east, north]] = bounds
  return east >= view.getWest() && west <= view.getEast() && north >= view.getSouth() && south <= view.getNorth()
}

export const ActivityMap = memo(function ActivityMap({
  ref,
  data,
  highlightedActivityId,
  typeFilter,
  dateCutoff,
  hoverType,
  initialPosition,
  initialBounds,
  onPositionChange,
}: ActivityMapProps) {
  const { resolvedTheme } = useTheme()
  const ready = Boolean(resolvedTheme)
  const mapRef = useRef<MapRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isLoadedRef = useRef(false)
  const hasFramedRef = useRef(false)
  // Set by the first move that carries a DOM event (drag, wheel, touch,
  // keyboard); programmatic moves (fitBounds/flyTo) have none.
  const hasUserMovedRef = useRef(false)
  const initialBoundsRef = useRef(initialBounds)

  const frameInitialBounds = useCallback(() => {
    const bounds = initialBoundsRef.current
    if (hasFramedRef.current || hasUserMovedRef.current || !isLoadedRef.current || !bounds || !mapRef.current) return
    hasFramedRef.current = true
    mapRef.current.fitBounds(bounds, { padding: DEFAULT_PADDING, retainPadding: false, maxZoom: 12, duration: 0 })
  }, [])

  // Bounds that show up after the map loaded still get framed (once).
  useEffect(() => {
    initialBoundsRef.current = initialBounds
    frameInitialBounds()
  }, [initialBounds, frameInitialBounds])

  // Resize the map only when the container actually changes size.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => mapRef.current?.resize())
    observer.observe(el)
    return () => observer.disconnect()
  }, [ready])

  const handleMove = useCallback((event: ViewStateChangeEvent) => {
    // Not every member of the event union carries `originalEvent`.
    if ('originalEvent' in event && event.originalEvent) hasUserMovedRef.current = true
  }, [])

  const handleMoveEnd = useCallback(
    ({ viewState }: ViewStateChangeEvent) => {
      onPositionChange({ latitude: viewState.latitude, longitude: viewState.longitude, zoom: viewState.zoom })
    },
    [onPositionChange],
  )

  const handleLoad = useCallback(() => {
    isLoadedRef.current = true
    frameInitialBounds()
  }, [frameInitialBounds])

  const fitBounds = useCallback((bounds: MapBounds, options?: FitOptions) => {
    mapRef.current?.fitBounds(bounds, {
      padding: options?.padding ?? DEFAULT_PADDING,
      retainPadding: false,
      duration: 500,
      maxZoom: 16,
    })
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      fitToBounds: (coordinates, options) => {
        const bounds = boundsOf(coordinates)
        if (bounds) fitBounds(bounds, options)
      },
      flyTo: ({ latitude, longitude, zoom = 12 }) => {
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom, duration: 1000 })
      },
      ensureInView: (coordinates, options) => {
        const bounds = boundsOf(coordinates)
        if (!bounds || !mapRef.current) return
        const view = mapRef.current.getMap().getBounds()
        if (view && intersectsView(bounds, view)) return
        fitBounds(bounds, options)
      },
    }),
    [fitBounds],
  )

  // Filter the existing source instead of rebuilding its GeoJSON.
  const layerFilter = useMemo(() => {
    const conditions = visibilityConditions(typeFilter, dateCutoff)
    if (hoverType) conditions.push(['==', ['get', 'type'], hoverType])
    return ['all', ...conditions] as mapboxgl.FilterSpecification
  }, [typeFilter, dateCutoff, hoverType])

  // The highlight obeys the same type/date filters so it disappears along
  // with its activity.
  const highlightFilter = useMemo((): mapboxgl.FilterSpecification => {
    if (!highlightedActivityId) return ['==', ['get', 'id'], '']
    return ['all', ['==', ['get', 'id'], highlightedActivityId], ...visibilityConditions(typeFilter, dateCutoff)]
  }, [highlightedActivityId, typeFilter, dateCutoff])

  // next-themes resolves the theme client-side; hold off until it's known so
  // Mapbox doesn't load one style and immediately swap to the other.
  if (!resolvedTheme) return <div className="absolute inset-0 bg-background" />
  const isDark = resolvedTheme === 'dark'

  return (
    <div ref={containerRef} className="size-full">
      <Map
        ref={mapRef}
        style={{ width: '100%', height: '100%' }}
        initialViewState={initialPosition}
        mapboxAccessToken={config.MAPBOX_ACCESS_TOKEN}
        mapStyle={isDark ? config.MAPBOX_MAP_STYLE_DARK : config.MAPBOX_MAP_STYLE_LIGHT}
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        onLoad={handleLoad}
        onStyleData={() => {
          const map = mapRef.current?.getMap()
          if (map) applyMapTheme(map, isDark)
        }}
      >
        <Source id="all-activities" type="geojson" data={data}>
          <Layer
            id="all-activities-layer"
            type="line"
            filter={layerFilter}
            layout={LINE_LAYOUT}
            paint={{
              'line-color': isDark ? '#D6D6D6' : '#262626',
              'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.65, 12, 1.1, 16, 1.6],
              'line-opacity': highlightedActivityId ? 0.15 : isDark ? 0.55 : 0.62,
            }}
          />
          <Layer
            id="highlighted-activity-casing"
            type="line"
            filter={highlightFilter}
            layout={LINE_LAYOUT}
            paint={{ 'line-color': isDark ? '#181818' : '#454545', 'line-width': 4, 'line-opacity': 0.8 }}
          />
          <Layer
            id="highlighted-activity-layer"
            type="line"
            filter={highlightFilter}
            layout={LINE_LAYOUT}
            paint={{ 'line-color': HIGHLIGHT_COLOR, 'line-width': 2.3, 'line-opacity': 1 }}
          />
        </Source>
      </Map>
    </div>
  )
})
