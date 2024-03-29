import ReactMapGL, { Layer, Source } from 'react-map-gl'
import { useTheme } from 'next-themes'

import { config } from '@/lib/config'

const MapboxHeatmap = (data: any) => {
  const { theme } = useTheme()
  const mapStyle = theme === 'dark' ? config.MAPBOX_MAP_STYLE_LIGHT : config.MAPBOX_MAP_STYLE_DARK
  const lineColor = theme === 'dark' ? '#BBB8B8' : '#2F2E2E'

  return (
    <div>
      <style jsx global>{`
        .mapboxgl-ctrl-attrib-inner {
          display: none;
        }
      `}</style>
      <ReactMapGL
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
              'line-width': 1,
              'line-opacity': 1,
            }}
            layout={{
              'line-join': 'round',
              'line-cap': 'round',
            }}
          />
        </Source>
      </ReactMapGL>
    </div>
  )
}

export default MapboxHeatmap
