import { useState, useCallback, useRef } from 'react'
import ReactMapGL, { Layer, Source } from 'react-map-gl'

import { config } from '@/utils/config'
import combinedGeoData from '@/data/combined'

const MapboxHeatmap = () => {
  return (
    <div>
      <style jsx global>{`
        .mapboxgl-ctrl-attrib-inner {
          display: none;
        }
      `}</style>
      <ReactMapGL
        style={{ width: '100vw', height: '100vh' }}
        initialViewState={{
          latitude: 51.5074,
          longitude: -0.1278,
          zoom: 10,
        }}
        mapboxAccessToken={String(config.MAPBOX_ACCESS_TOKEN)}
        mapStyle="mapbox://styles/behlock/cljr22vwz011s01pjgtfedqtc"
        onRender={(event) => event.target.resize()}
      >
        <Source id="data" type="geojson" data={combinedGeoData}>
          <Layer
            id="runs2"
            type="line"
            paint={{
              'line-color': 'blue',
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
