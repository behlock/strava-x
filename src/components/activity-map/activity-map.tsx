'use client'

import 'mapbox-gl/dist/mapbox-gl.css'
import * as mapboxgl from 'mapbox-gl/esm'

import type { PaddingOptions, ExpressionSpecification, FilterSpecification, LngLatBounds } from 'mapbox-gl'
import { type Ref, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Layer, Map, type MapRef, type MapProps, Source, type ViewStateChangeEvent } from 'react-map-gl/mapbox'
import { useTheme } from 'next-themes'

import type { ActivityFeatureCollection } from '@/models/activity'
import type { LngLat, MapBounds, MapPosition } from '@/models/map'
import { ACTIVITY_TYPE_COLORS, DEFAULT_ACTIVITY_COLOR } from '@/lib/activity-colors'
import { config } from '@/lib/config'
import { boundsOf } from '@/lib/geo-utils'
import { applyMapTheme } from '@/lib/map-theme'
import { heatmapPaint } from '@/lib/heatmap-paint'
import {
  comparisonColors,
  DEFAULT_COMPARISON_PALETTE,
  DEFAULT_COMPARISON_RENDER_MODE,
  type ComparisonPaletteId,
  type ComparisonRenderMode,
  type RouteAppearance,
} from '@/lib/comparison-appearance'
import {
  comparisonLinePaint,
  comparisonGlowPaint,
  personalRouteColor,
  personalRoutePaint,
} from '@/lib/comparison-paint'
import type { RouteHeatmaps } from '@/lib/route-heatmap'

interface FitOptions {
  animate?: boolean
  padding?: PaddingOptions
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
  publicTiles?: string
  publicHeatTiles?: string
  onPublicTileError?: () => void
  commonRoutes?: ActivityFeatureCollection
  comparisonVisible?: boolean
  ownRoutes?: ActivityFeatureCollection
  comparisonPaletteId?: ComparisonPaletteId
  comparisonRenderMode?: ComparisonRenderMode
  personalAppearance?: Pick<RouteAppearance, 'paletteId' | 'renderMode'>
  heatmaps?: RouteHeatmaps
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

const SHARED_BASE_STYLE =
  config.MAPBOX_MAP_STYLE_LIGHT === 'mapbox://styles/mapbox/light-v11' &&
  config.MAPBOX_MAP_STYLE_DARK === 'mapbox://styles/mapbox/dark-v11'
// ESM and default entrypoints ship duplicate nominal types; the runtime API is identical.
const MAP_LIBRARY = mapboxgl as unknown as NonNullable<MapProps['mapLib']>

const DEFAULT_PADDING: PaddingOptions = { top: 80, bottom: 80, left: 100, right: 80 }
const LINE_LAYOUT = { 'line-join': 'round', 'line-cap': 'round' } as const

const HIGHLIGHT_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'type'],
  ...Object.entries(ACTIVITY_TYPE_COLORS).flat(),
  DEFAULT_ACTIVITY_COLOR,
] as ExpressionSpecification

function visibilityConditions(typeFilter: string[], dateCutoff: number | null): FilterSpecification[] {
  const conditions: FilterSpecification[] = [['in', ['get', 'type'], ['literal', typeFilter]]]
  if (dateCutoff !== null) conditions.push(['<=', ['get', 'dateTs'], dateCutoff])
  return conditions
}

function intersectsView(bounds: MapBounds, view: LngLatBounds): boolean {
  const [[west, south], [east, north]] = bounds
  return east >= view.getWest() && west <= view.getEast() && north >= view.getSouth() && south <= view.getNorth()
}

export const ActivityMap = memo(function ActivityMap({
  ref,
  data,
  publicTiles,
  publicHeatTiles,
  onPublicTileError,
  commonRoutes,
  comparisonVisible = true,
  ownRoutes,
  comparisonPaletteId = DEFAULT_COMPARISON_PALETTE,
  comparisonRenderMode = DEFAULT_COMPARISON_RENDER_MODE,
  personalAppearance,
  heatmaps,
  highlightedActivityId,
  typeFilter,
  dateCutoff,
  hoverType,
  initialPosition,
  initialBounds,
  onPositionChange,
}: ActivityMapProps) {
  const comparing = Boolean(commonRoutes) && comparisonVisible
  const wantsHotspots = (comparing ? comparisonRenderMode : personalAppearance?.renderMode) === 'hotspots'
  const [preparedTileHeat, setPreparedTileHeat] = useState<string | null>(null)
  const [failedTileHeat, setFailedTileHeat] = useState<string | null>(null)
  useEffect(() => {
    if (!publicHeatTiles) return
    const timer = setTimeout(() => setPreparedTileHeat(publicHeatTiles), wantsHotspots ? 0 : 1200)
    return () => clearTimeout(timer)
  }, [publicHeatTiles, wantsHotspots])
  const tileHeatAvailable = Boolean(publicHeatTiles && failedTileHeat !== publicHeatTiles)
  const { resolvedTheme } = useTheme()
  const ready = Boolean(resolvedTheme)
  const mapRef = useRef<MapRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isLoadedRef = useRef(false)
  const hasFramedRef = useRef(false)
  // Direct gestures and explicit navigation both take precedence over initial framing.
  const hasUserMovedRef = useRef(false)
  const initialBoundsRef = useRef(initialBounds)

  const hasVisibleHighlight = useMemo(
    () =>
      data.features.some(
        ({ properties: p }) =>
          p.id === highlightedActivityId &&
          typeFilter.includes(p.type) &&
          (dateCutoff === null || p.dateTs <= dateCutoff) &&
          (!hoverType || p.type === hoverType),
      ),
    [data, highlightedActivityId, typeFilter, dateCutoff, hoverType],
  )

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
    hasUserMovedRef.current = true
    mapRef.current?.fitBounds(bounds, {
      padding: options?.padding ?? DEFAULT_PADDING,
      retainPadding: false,
      duration: options?.animate === false ? 0 : 250,
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
        hasUserMovedRef.current = true
        mapRef.current?.flyTo({
          center: [longitude, latitude],
          zoom,
          padding: 0,
          retainPadding: false,
          duration: 1000,
        })
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
    return ['all', ...conditions] as FilterSpecification
  }, [typeFilter, dateCutoff, hoverType])

  // The highlight obeys the same type/date filters so it disappears along
  // with its activity.
  const highlightFilter = useMemo((): FilterSpecification => {
    if (!hasVisibleHighlight || comparing) return ['==', ['get', 'id'], '']
    return ['all', ['==', ['get', 'id'], highlightedActivityId], ...visibilityConditions(typeFilter, dateCutoff)]
  }, [highlightedActivityId, hasVisibleHighlight, typeFilter, dateCutoff, comparing])

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (map?.isStyleLoaded()) applyMapTheme(map, resolvedTheme === 'dark', SHARED_BASE_STYLE)
  }, [resolvedTheme])

  // next-themes resolves the theme client-side; hold off until it's known so
  // Mapbox doesn't load one style and immediately swap to the other.
  if (!resolvedTheme) return <div className="absolute inset-0 bg-background" />
  const isDark = resolvedTheme === 'dark'
  const colors = comparisonColors(comparisonPaletteId, isDark)
  const requestedMode = comparing ? comparisonRenderMode : (personalAppearance?.renderMode ?? 'routes')
  const renderMode =
    requestedMode === 'hotspots' &&
    ((!heatmaps && !tileHeatAvailable) || (publicHeatTiles && failedTileHeat === publicHeatTiles))
      ? 'routes'
      : requestedMode
  const personalColor = personalRouteColor(personalAppearance?.paletteId ?? 'graphite', isDark)

  return (
    <div ref={containerRef} className="size-full">
      <Map
        ref={mapRef}
        mapLib={MAP_LIBRARY}
        reuseMaps
        style={{ width: '100%', height: '100%' }}
        initialViewState={initialPosition}
        mapboxAccessToken={config.MAPBOX_ACCESS_TOKEN}
        mapStyle={
          SHARED_BASE_STYLE
            ? config.MAPBOX_MAP_STYLE_LIGHT
            : isDark
              ? config.MAPBOX_MAP_STYLE_DARK
              : config.MAPBOX_MAP_STYLE_LIGHT
        }
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        onLoad={handleLoad}
        onError={(event) => {
          if ('sourceId' in event && event.sourceId === 'public-heatmap' && publicHeatTiles)
            setFailedTileHeat(publicHeatTiles)
          else if ('sourceId' in event && event.sourceId === 'all-activities' && publicTiles) onPublicTileError?.()
          else console.error('[map]', event.error)
        }}
        onStyleData={() => {
          const map = mapRef.current?.getMap()
          if (map) applyMapTheme(map, isDark, SHARED_BASE_STYLE)
        }}
      >
        <Source
          key={publicTiles ?? 'geojson'}
          id="all-activities"
          {...(publicTiles
            ? { type: 'vector' as const, tiles: [publicTiles], maxzoom: 16 }
            : { type: 'geojson' as const, data })}
        >
          <Layer
            id="all-activities-layer"
            type="line"
            {...(publicTiles ? { 'source-layer': 'routes' } : {})}
            filter={layerFilter}
            layout={LINE_LAYOUT}
            paint={
              comparing
                ? comparisonLinePaint(colors.other, 'other', renderMode)
                : personalRoutePaint(isDark, personalColor, renderMode, hasVisibleHighlight)
            }
          />
          {(comparing || personalAppearance) && renderMode === 'glow' && (
            <Layer
              id="comparison-other-glow"
              beforeId="all-activities-layer"
              type="line"
              {...(publicTiles ? { 'source-layer': 'routes' } : {})}
              filter={layerFilter}
              layout={LINE_LAYOUT}
              paint={{
                ...comparisonGlowPaint(comparing ? colors.other : personalColor),
                ...(!comparing && hasVisibleHighlight ? { 'line-opacity': 0.015 } : {}),
              }}
            />
          )}
          <Layer
            id="highlighted-activity-casing"
            type="line"
            {...(publicTiles ? { 'source-layer': 'routes' } : {})}
            filter={highlightFilter}
            layout={LINE_LAYOUT}
            paint={{
              'line-color': isDark ? '#181818' : '#454545',
              'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3.5, 12, 4.5, 16, 6],
              'line-opacity': 0.95,
            }}
          />
          <Layer
            id="highlighted-activity-layer"
            type="line"
            {...(publicTiles ? { 'source-layer': 'routes' } : {})}
            filter={highlightFilter}
            layout={LINE_LAYOUT}
            paint={{
              'line-color': HIGHLIGHT_COLOR,
              'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.5, 12, 2.5, 16, 3.5],
              'line-opacity': 1,
            }}
          />
        </Source>
        {ownRoutes &&
          heatmaps &&
          (['other', 'own', 'overlap'] as const)
            .filter((role) => role !== 'other' || !publicHeatTiles)
            .map((role) => (
              <Source key={role} id={`heatmap-${role}`} type="geojson" data={heatmaps[role]}>
                <Layer
                  id={`heatmap-${role}-layer`}
                  beforeId="all-activities-layer"
                  type="heatmap"
                  filter={layerFilter}
                  paint={heatmapPaint(
                    isDark,
                    comparing && renderMode === 'hotspots' ? 0.85 : 0,
                    role === 'overlap' ? undefined : colors[role],
                  )}
                />
              </Source>
            ))}
        {personalAppearance && !publicHeatTiles && heatmaps && (
          <Source id="personal-heatmap" type="geojson" data={ownRoutes ? heatmaps.other : heatmaps.own}>
            <Layer
              id="personal-heatmap-layer"
              beforeId="all-activities-layer"
              type="heatmap"
              filter={layerFilter}
              paint={heatmapPaint(
                isDark,
                !comparing && renderMode === 'hotspots' ? (hasVisibleHighlight ? 0.15 : 0.8) : 0,
              )}
            />
          </Source>
        )}
        {publicHeatTiles && preparedTileHeat === publicHeatTiles && tileHeatAvailable && (
          <Source id="public-heatmap" type="vector" tiles={[publicHeatTiles]} maxzoom={16}>
            <Layer
              id="public-heatmap-layer"
              source-layer="routes"
              beforeId="all-activities-layer"
              type="heatmap"
              filter={layerFilter}
              paint={heatmapPaint(
                isDark,
                renderMode === 'hotspots' ? (comparing ? 0.85 : hasVisibleHighlight ? 0.15 : 0.8) : 0,
                comparing ? colors.other : undefined,
              )}
            />
          </Source>
        )}
        {ownRoutes && (
          <Source id="comparison-own-routes" type="geojson" data={ownRoutes}>
            <Layer
              id="comparison-own-routes-layer"
              type="line"
              filter={layerFilter}
              layout={{
                ...LINE_LAYOUT,
                'line-cap': renderMode === 'routes' ? 'butt' : 'round',
              }}
              paint={{
                ...comparisonLinePaint(colors.own, 'own', renderMode),
                ...(!comparing ? { 'line-opacity': 0 } : {}),
              }}
            />
            {comparing && renderMode === 'glow' && (
              <Layer
                id="comparison-own-glow"
                beforeId="comparison-own-routes-layer"
                type="line"
                filter={layerFilter}
                layout={LINE_LAYOUT}
                paint={comparisonGlowPaint(colors.own)}
              />
            )}
          </Source>
        )}
        {commonRoutes && (
          <Source id="common-routes" type="geojson" data={commonRoutes}>
            <Layer
              id="common-routes-casing"
              type="line"
              filter={layerFilter}
              layout={LINE_LAYOUT}
              paint={{
                'line-color': isDark ? '#181818' : '#fafafa',
                'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 12, 4.5, 16, 6],
                'line-opacity': comparing && renderMode === 'routes' ? 0.9 : 0,
                'line-opacity-transition': { duration: 0 },
              }}
            />
            {comparing && renderMode === 'glow' && (
              <Layer
                id="comparison-overlap-glow"
                beforeId="common-routes-casing"
                type="line"
                filter={layerFilter}
                layout={LINE_LAYOUT}
                paint={comparisonGlowPaint(colors.overlap)}
              />
            )}
            <Layer
              id="common-routes-layer"
              type="line"
              filter={layerFilter}
              layout={LINE_LAYOUT}
              paint={{
                ...comparisonLinePaint(colors.overlap, 'overlap', renderMode),
                ...(!comparing ? { 'line-opacity': 0 } : {}),
              }}
            />
          </Source>
        )}
      </Map>
    </div>
  )
})
