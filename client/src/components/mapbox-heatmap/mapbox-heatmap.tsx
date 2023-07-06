import React, { useState, useCallback, useRef } from 'react'
import Map, { Layer, Source } from 'react-map-gl'

import { config } from '@/lib/utils'
import combinedGeoData from '@/data/combined'

const MapboxHeatmap = (geoJsonData: any) => {
  const mapRef = useRef()
  const mapRefCallback = useCallback(
    (ref: any) => {
      if (ref !== null) {
        mapRef.current = ref
      }
    },
    [mapRef]
  )

  const [viewport, setViewport] = useState({
    width: '100%',
    height: '100vh',
    latitude: 51.5074,
    longitude: -0.1278,
    zoom: 10,
  })

  return (
    <div style={{ position: 'relative', width: '200%', height: '200%' }}>
      <Map
        {...viewport}
        mapStyle="mapbox://styles/behlock/cljr22vwz011s01pjgtfedqtc"
        mapboxAccessToken={config.MAPBOX_ACCESS_TOKEN}
        initialViewState={{
          longitude: -100,
          latitude: 40,
          zoom: 0.1,
        }}
      >
        <Source id="data" type="geojson" data={combinedGeoData}>
          <Layer
            id="runs2"
            type="line"
            paint={{
              'line-color': 'blue',
              'line-width': 1,
              // 'line-dasharray': [2, 2],
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
}

export default MapboxHeatmap
