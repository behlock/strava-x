import { Map, Layer, Source } from 'react-map-gl/mapbox'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { config } from '@/lib/config'

const MapboxHeatmap = (data: any) => {
  const { theme, systemTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const currentTheme = theme === 'system' ? systemTheme : theme
  const isDark = currentTheme === 'dark'

  const mapStyle = isDark ? config.MAPBOX_MAP_STYLE_DARK : config.MAPBOX_MAP_STYLE_LIGHT

  const lineColor = isDark ? '#FFFFFF' : '#000000'

  if (!mounted) {
    return <div style={{ width: '100%', height: '90vh', backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0' }} />
  }

  return (
    <div>
      <style jsx global>{`
        .mapboxgl-ctrl-attrib-inner {
          display: none;
        }
        .mapboxgl-ctrl-bottom-left,
        .mapboxgl-ctrl-bottom-right {
          display: none;
        }
      `}</style>
      <Map
        style={{ width: '100%', height: '90vh' }}
        initialViewState={{
          latitude: 51.5074,
          longitude: -0.1278,
          zoom: 15,
        }}
        mapboxAccessToken={config.MAPBOX_ACCESS_TOKEN}
        mapStyle={mapStyle}
        onRender={(event) => event.target.resize()}
      >
        <Source id="data" type="geojson" data={data.data}>
          <Layer
            id="runs2"
            type="line"
            paint={{
              'line-color': lineColor,
              'line-width': 2,
              'line-opacity': 0.8,
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
}

export default MapboxHeatmap
