'use client'

import 'mapbox-gl/dist/mapbox-gl.css'
import mapboxgl from 'mapbox-gl'

import { Map, Layer, Source, MapRef } from 'react-map-gl/mapbox'

import { useTheme } from 'next-themes'

// Disable Mapbox telemetry to prevent console errors when ad blockers are enabled
if (typeof window !== 'undefined' && (mapboxgl as unknown as { setTelemetryEnabled?: (enabled: boolean) => void }).setTelemetryEnabled) {
  (mapboxgl as unknown as { setTelemetryEnabled: (enabled: boolean) => void }).setTelemetryEnabled(false)
}
import { useMemo, useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import type { FeatureCollection, Feature, LineString } from 'geojson'
import type { ViewStateChangeEvent } from 'react-map-gl/mapbox'

import { config } from '@/lib/config'
import { Activity, ActivityFeatureCollection } from '@/models/activity'
import { getActivityColor } from '@/hooks/use-statistics'
import { useMounted } from '@/hooks/use-mounted'

export interface MapboxHeatmapRef {
  getCanvas: () => HTMLCanvasElement | null
  fitToBounds: (coordinates: [number, number][]) => void
  flyTo: (position: { latitude: number; longitude: number; zoom?: number }) => void
}

export interface MapPosition {
  latitude: number
  longitude: number
  zoom: number
}

interface MapboxHeatmapProps {
  data: ActivityFeatureCollection
  activities?: Activity[]
  highlightedActivityId?: string | null
  initialPosition?: MapPosition
  onPositionChange?: (position: MapPosition) => void
}

const MapboxHeatmap = forwardRef<MapboxHeatmapRef, MapboxHeatmapProps>(function MapboxHeatmap(
  { data, activities = [], highlightedActivityId, initialPosition, onPositionChange },
  ref
) {
  const mapRef = useRef<MapRef>(null)

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
    [onPositionChange]
  )

  useImperativeHandle(ref, () => ({
    getCanvas: () => mapRef.current?.getCanvas() ?? null,
    fitToBounds: (coordinates: [number, number][]) => {
      if (!mapRef.current || coordinates.length === 0) return

      // Calculate bounds from coordinates
      let minLng = Infinity, maxLng = -Infinity
      let minLat = Infinity, maxLat = -Infinity

      for (const [lng, lat] of coordinates) {
        minLng = Math.min(minLng, lng)
        maxLng = Math.max(maxLng, lng)
        minLat = Math.min(minLat, lat)
        maxLat = Math.max(maxLat, lat)
      }

      // Asymmetric padding: more on left for sidebar, generous on all sides
      // to ensure the entire path is visible and well-framed
      mapRef.current.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        {
          padding: { top: 80, bottom: 80, left: 100, right: 80 },
          duration: 500,
          maxZoom: 16, // Prevent over-zooming on small paths
        }
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
  }))

  const { theme, systemTheme } = useTheme()
  const mounted = useMounted()

  const currentTheme = theme === 'system' ? systemTheme : theme
  const isDark = currentTheme === 'dark'

  const mapStyle = isDark ? config.MAPBOX_MAP_STYLE_DARK : config.MAPBOX_MAP_STYLE_LIGHT
  const lineColor = isDark ? '#F0EBE3' : '#000000'

  const highlightedData = useMemo((): FeatureCollection<LineString> | null => {
    if (!highlightedActivityId || !activities.length) return null

    const activity = activities.find((a) => a.id === highlightedActivityId)
    if (!activity?.feature) return null

    const feature: Feature<LineString> = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: activity.feature.geometry.coordinates,
      },
      properties: {
        color: getActivityColor(activity.type),
      },
    }

    return {
      type: 'FeatureCollection',
      features: [feature],
    }
  }, [highlightedActivityId, activities])

  if (!mounted) {
    return <div className="absolute inset-0 bg-background" />
  }

  return (
    <Map
      ref={mapRef}
      style={{ width: '100%', height: '100%' }}
      initialViewState={initialPosition ?? {
        latitude: 51.5074,
        longitude: -0.1278,
        zoom: 15,
      }}
      mapboxAccessToken={config.MAPBOX_ACCESS_TOKEN}
      mapStyle={mapStyle}
      preserveDrawingBuffer={true}
      onRender={(event) => event.target.resize()}
      onMoveEnd={handleMoveEnd}
    >
      <Source id="all-activities" type="geojson" data={data}>
        <Layer
          id="all-activities-layer"
          type="line"
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
      </Source>

      {highlightedData && (
        <Source id="highlighted-activity" type="geojson" data={highlightedData}>
          <Layer
            id="highlighted-activity-layer"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': 4,
              'line-opacity': 1,
            }}
            layout={{
              'line-join': 'round',
              'line-cap': 'round',
            }}
          />
        </Source>
      )}
    </Map>
  )
})

export default MapboxHeatmap
