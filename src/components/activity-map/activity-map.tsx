'use client'

import 'mapbox-gl/dist/mapbox-gl.css'

import type mapboxgl from 'mapbox-gl'
import { type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { Layer, Map, type MapRef, Source, type ViewStateChangeEvent } from 'react-map-gl/mapbox'
import { useTheme } from 'next-themes'

import type { ActivityFeatureCollection } from '@/models/activity'
import { DEFAULT_MAP_POSITION, type LngLat, type MapBounds, type MapPosition } from '@/models/map'
import { ACTIVITY_TYPE_COLORS, DEFAULT_ACTIVITY_COLOR } from '@/lib/activity-colors'
import { config } from '@/lib/config'
import { boundsOf } from '@/lib/geo-utils'

interface FitOptions {
  padding?: mapboxgl.PaddingOptions
}

export interface ActivityMapRef {
  getCanvas: () => HTMLCanvasElement | null
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
   * Bounds to fit on first map load. The map renders at `initialPosition`
   * (so the canvas isn't blank) then snaps to these once Mapbox finishes
   * loading. Later changes are ignored.
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
  const conditions: mapboxgl.FilterSpecification[] = []
  if (typeFilter.length > 0) conditions.push(['in', ['get', 'type'], ['literal', typeFilter]])
  if (dateCutoff !== null) conditions.push(['<=', ['get', 'dateTs'], dateCutoff])
  return conditions
}

function allOf(conditions: mapboxgl.FilterSpecification[]): mapboxgl.FilterSpecification | undefined {
  return conditions.length > 0 ? (['all', ...conditions] as mapboxgl.FilterSpecification) : undefined
}

function intersectsView(bounds: MapBounds, view: mapboxgl.LngLatBounds): boolean {
  const [[west, south], [east, north]] = bounds
  return east >= view.getWest() && west <= view.getEast() && north >= view.getSouth() && south <= view.getNorth()
}

export function ActivityMap({
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
  const mapRef = useRef<MapRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasFramedRef = useRef(false)
  const initialBoundsRef = useRef(initialBounds)
  useEffect(() => {
    initialBoundsRef.current = initialBounds
  }, [initialBounds])

  // Resize the map only when the container actually changes size.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => mapRef.current?.resize())
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleMoveEnd = useCallback(
    ({ viewState }: ViewStateChangeEvent) => {
      onPositionChange({ latitude: viewState.latitude, longitude: viewState.longitude, zoom: viewState.zoom })
    },
    [onPositionChange],
  )

  const handleLoad = useCallback(() => {
    const bounds = initialBoundsRef.current
    if (hasFramedRef.current || !bounds || !mapRef.current) return
    hasFramedRef.current = true
    mapRef.current.fitBounds(bounds, { padding: DEFAULT_PADDING, maxZoom: 12, duration: 0 })
  }, [])

  const fitBounds = useCallback((bounds: MapBounds, options?: FitOptions) => {
    mapRef.current?.fitBounds(bounds, { padding: options?.padding ?? DEFAULT_PADDING, duration: 500, maxZoom: 16 })
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      getCanvas: () => mapRef.current?.getCanvas() ?? null,
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

  // Filters run on the GPU, so the GeoJSON source never has to be rebuilt.
  const layerFilter = useMemo(() => {
    const conditions = visibilityConditions(typeFilter, dateCutoff)
    if (hoverType) conditions.push(['==', ['get', 'type'], hoverType])
    return allOf(conditions)
  }, [typeFilter, dateCutoff, hoverType])

  // The highlight obeys the same type/date filters so it disappears along
  // with its activity.
  const highlightFilter = useMemo((): mapboxgl.FilterSpecification => {
    if (!highlightedActivityId) return ['==', ['get', 'id'], '']
    return ['all', ['==', ['get', 'id'], highlightedActivityId], ...visibilityConditions(typeFilter, dateCutoff)]
  }, [highlightedActivityId, typeFilter, dateCutoff])

  // next-themes resolves the theme client-side; hold off until it's known so
  // Mapbox doesn't load one style and immediately swap to the other.
  const { resolvedTheme } = useTheme()
  if (!resolvedTheme) return <div className="absolute inset-0 bg-background" />
  const isDark = resolvedTheme === 'dark'

  return (
    <div ref={containerRef} className="size-full">
      <Map
        ref={mapRef}
        style={{ width: '100%', height: '100%' }}
        initialViewState={initialPosition ?? DEFAULT_MAP_POSITION}
        mapboxAccessToken={config.MAPBOX_ACCESS_TOKEN}
        mapStyle={isDark ? config.MAPBOX_MAP_STYLE_DARK : config.MAPBOX_MAP_STYLE_LIGHT}
        preserveDrawingBuffer
        onMoveEnd={handleMoveEnd}
        onLoad={handleLoad}
      >
        <Source id="all-activities" type="geojson" data={data}>
          <Layer
            id="all-activities-layer"
            type="line"
            filter={layerFilter}
            layout={LINE_LAYOUT}
            paint={{
              'line-color': isDark ? '#F5F5F5' : '#000000',
              'line-width': highlightedActivityId ? 1 : 1.5,
              'line-opacity': highlightedActivityId ? 0.15 : 0.5,
            }}
          />
          <Layer
            id="highlighted-activity-layer"
            type="line"
            filter={highlightFilter}
            layout={LINE_LAYOUT}
            paint={{ 'line-color': HIGHLIGHT_COLOR, 'line-width': 1.5, 'line-opacity': 1 }}
          />
        </Source>
      </Map>
    </div>
  )
}
