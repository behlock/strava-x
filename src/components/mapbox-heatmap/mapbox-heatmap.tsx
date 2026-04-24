'use client'

import 'mapbox-gl/dist/mapbox-gl.css'
import mapboxgl from 'mapbox-gl'

import { Map, Layer, Source, MapRef } from 'react-map-gl/mapbox'

import { useTheme } from 'next-themes'

// Disable Mapbox telemetry to prevent console errors when ad blockers are enabled
if (
  typeof window !== 'undefined' &&
  (mapboxgl as unknown as { setTelemetryEnabled?: (enabled: boolean) => void }).setTelemetryEnabled
) {
  ;(mapboxgl as unknown as { setTelemetryEnabled: (enabled: boolean) => void }).setTelemetryEnabled(false)
}
import { useMemo, useRef, useImperativeHandle, forwardRef, useCallback, useEffect } from 'react'
import type { ViewStateChangeEvent } from 'react-map-gl/mapbox'

import { config } from '@/lib/config'
import { ActivityFeatureCollection } from '@/models/activity'
import { useMounted } from '@/hooks/use-mounted'

export interface MapboxHeatmapRef {
  getCanvas: () => HTMLCanvasElement | null
  fitToBounds: (coordinates: [number, number][], options?: { padding?: mapboxgl.PaddingOptions }) => void
  flyTo: (position: { latitude: number; longitude: number; zoom?: number }) => void
  ensureInView: (coordinates: [number, number][], options?: { padding?: mapboxgl.PaddingOptions }) => void
}

const DEFAULT_PADDING: mapboxgl.PaddingOptions = { top: 80, bottom: 80, left: 100, right: 80 }

export interface MapPosition {
  latitude: number
  longitude: number
  zoom: number
}

interface MapboxHeatmapProps {
  data: ActivityFeatureCollection
  highlightedActivityId?: string | null
  typeFilter?: string[]
  dateCutoff?: number | null // unix ms timestamp; null = no filter
  hoverType?: string | null
  initialPosition?: MapPosition
  onPositionChange?: (position: MapPosition) => void
}

const MapboxHeatmap = forwardRef<MapboxHeatmapRef, MapboxHeatmapProps>(function MapboxHeatmap(
  { data, highlightedActivityId, typeFilter, dateCutoff, hoverType, initialPosition, onPositionChange },
  ref,
) {
  const mapRef = useRef<MapRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Resize map only when the container actually changes size (not every frame)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleMoveEnd = useCallback(
    (event: ViewStateChangeEvent) => {
      if (onPositionChange) {
        onPositionChange({
          latitude: event.viewState.latitude,
          longitude: event.viewState.longitude,
          zoom: event.viewState.zoom,
        })
      }
    },
    [onPositionChange],
  )

  useImperativeHandle(ref, () => ({
    getCanvas: () => mapRef.current?.getCanvas() ?? null,
    fitToBounds: (coordinates: [number, number][], options?: { padding?: mapboxgl.PaddingOptions }) => {
      if (!mapRef.current || coordinates.length === 0) return

      let minLng = Infinity,
        maxLng = -Infinity
      let minLat = Infinity,
        maxLat = -Infinity

      for (const [lng, lat] of coordinates) {
        minLng = Math.min(minLng, lng)
        maxLng = Math.max(maxLng, lng)
        minLat = Math.min(minLat, lat)
        maxLat = Math.max(maxLat, lat)
      }

      mapRef.current.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        {
          padding: options?.padding ?? DEFAULT_PADDING,
          duration: 500,
          maxZoom: 16,
        },
      )
    },
    flyTo: (position: { latitude: number; longitude: number; zoom?: number }) => {
      if (!mapRef.current) return
      mapRef.current.flyTo({
        center: [position.longitude, position.latitude],
        zoom: position.zoom ?? 12,
        duration: 1000,
      })
    },
    ensureInView: (coordinates: [number, number][], options?: { padding?: mapboxgl.PaddingOptions }) => {
      if (!mapRef.current || coordinates.length === 0) return

      let minLng = Infinity,
        maxLng = -Infinity
      let minLat = Infinity,
        maxLat = -Infinity
      for (const [lng, lat] of coordinates) {
        minLng = Math.min(minLng, lng)
        maxLng = Math.max(maxLng, lng)
        minLat = Math.min(minLat, lat)
        maxLat = Math.max(maxLat, lat)
      }

      const view = mapRef.current.getMap().getBounds()
      if (view) {
        const intersects =
          maxLng >= view.getWest() && minLng <= view.getEast() && maxLat >= view.getSouth() && minLat <= view.getNorth()
        if (intersects) return
      }

      mapRef.current.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        {
          padding: options?.padding ?? DEFAULT_PADDING,
          duration: 500,
          maxZoom: 16,
        },
      )
    },
  }))

  const { theme, systemTheme } = useTheme()
  const mounted = useMounted()

  const currentTheme = theme === 'system' ? systemTheme : theme
  const isDark = currentTheme === 'dark'

  const mapStyle = isDark ? config.MAPBOX_MAP_STYLE_DARK : config.MAPBOX_MAP_STYLE_LIGHT
  const lineColor = isDark ? '#F5F5F5' : '#000000'

  // Build a single Mapbox filter expression from the filter props.
  // This runs on the GPU and avoids rebuilding the GeoJSON in JS.
  const layerFilter = useMemo(() => {
    const conditions: mapboxgl.FilterSpecification[] = []
    if (typeFilter && typeFilter.length > 0) {
      conditions.push(['in', ['get', 'type'], ['literal', typeFilter]])
    }
    if (dateCutoff != null) {
      conditions.push(['<=', ['get', 'dateTs'], dateCutoff])
    }
    if (hoverType) {
      conditions.push(['==', ['get', 'type'], hoverType])
    }
    return conditions.length > 0 ? (['all', ...conditions] as mapboxgl.FilterSpecification) : undefined
  }, [typeFilter, dateCutoff, hoverType])

  // Highlight filter — matches the single highlighted activity by id
  const highlightFilter = useMemo((): mapboxgl.FilterSpecification | undefined => {
    if (!highlightedActivityId) return ['==', ['get', 'id'], '']
    // Apply the same type/date filter so highlight disappears when filtered out
    const conditions: mapboxgl.FilterSpecification[] = [['==', ['get', 'id'], highlightedActivityId]]
    if (typeFilter && typeFilter.length > 0) {
      conditions.push(['in', ['get', 'type'], ['literal', typeFilter]])
    }
    if (dateCutoff != null) {
      conditions.push(['<=', ['get', 'dateTs'], dateCutoff])
    }
    return ['all', ...conditions] as mapboxgl.FilterSpecification
  }, [highlightedActivityId, typeFilter, dateCutoff])

  if (!mounted) {
    return <div className="absolute inset-0 bg-background" />
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <Map
        ref={mapRef}
        style={{ width: '100%', height: '100%' }}
        initialViewState={
          initialPosition ?? {
            latitude: 51.5074,
            longitude: -0.1278,
            zoom: 15,
          }
        }
        mapboxAccessToken={config.MAPBOX_ACCESS_TOKEN}
        mapStyle={mapStyle}
        preserveDrawingBuffer={true}
        onMoveEnd={handleMoveEnd}
      >
        <Source id="all-activities" type="geojson" data={data}>
          <Layer
            id="all-activities-layer"
            type="line"
            filter={layerFilter}
            paint={{
              'line-color': lineColor,
              'line-width': highlightedActivityId ? 1 : 1.5,
              'line-opacity': highlightedActivityId ? 0.15 : 0.5,
            }}
            layout={{
              'line-join': 'round',
              'line-cap': 'round',
            }}
          />
          <Layer
            id="highlighted-activity-layer"
            type="line"
            filter={highlightFilter}
            paint={{
              'line-color': [
                'match',
                ['get', 'type'],
                'running',
                '#FF5500',
                'cycling',
                '#FFE600',
                'hiking',
                '#00FF87',
                'walking',
                '#00D4FF',
                '#FF0080',
              ],
              'line-width': 1.5,
              'line-opacity': 1,
            }}
            layout={{
              'line-join': 'round',
              'line-cap': 'round',
            }}
          />
        </Source>
      </Map>
    </div>
  )
})

export default MapboxHeatmap
