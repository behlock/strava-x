"use client"

import { Map, Layer, Source } from 'react-map-gl/mapbox'
import { useTheme } from 'next-themes'
import { useEffect, useState, useMemo } from 'react'
import type { FeatureCollection, Feature, LineString } from 'geojson'

import { config } from '@/lib/config'
import { Activity } from '@/models/activity'
import { getActivityColor } from '@/hooks/use-statistics'

interface MapboxHeatmapProps {
  data: any
  activities?: Activity[]
  highlightedActivityId?: string | null
}

const MapboxHeatmap = ({ data, activities = [], highlightedActivityId }: MapboxHeatmapProps) => {
  const { theme, systemTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const currentTheme = theme === 'system' ? systemTheme : theme
  const isDark = currentTheme === 'dark'

  const mapStyle = isDark ? config.MAPBOX_MAP_STYLE_DARK : config.MAPBOX_MAP_STYLE_LIGHT
  // Warm charcoal for light mode, cream for dark mode (TE-inspired)
  const lineColor = isDark ? '#F0EBE3' : '#2D2D2D'

  // Create highlighted activity data
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
    return (
      <div
        className="absolute inset-0 bg-background"
      />
    )
  }

  return (
    <Map
        style={{ width: '100%', height: '100%' }}
        initialViewState={{
          latitude: 51.5074,
          longitude: -0.1278,
          zoom: 15,
        }}
        mapboxAccessToken={config.MAPBOX_ACCESS_TOKEN}
        mapStyle={mapStyle}
        onRender={(event) => event.target.resize()}
      >
        {/* Base layer - all activities */}
        <Source id="all-activities" type="geojson" data={data}>
          <Layer
            id="all-activities-layer"
            type="line"
            paint={{
              'line-color': lineColor,
              'line-width': highlightedActivityId ? 1 : 1.5,
              'line-opacity': highlightedActivityId ? 0.25 : 0.5,
            }}
            layout={{
              'line-join': 'round',
              'line-cap': 'round',
            }}
          />
        </Source>

        {/* Highlighted activity layer */}
        {highlightedData && (
          <Source id="highlighted-activity" type="geojson" data={highlightedData}>
            <Layer
              id="highlighted-activity-layer"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 3,
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
}

export default MapboxHeatmap
