import type { Map } from 'mapbox-gl'

const backgroundLayers = new WeakMap<Map, string>()

/** Local presentation overrides for the configured Mapbox styles. */
export function applyMapTheme(map: Map, isDark: boolean) {
  const land = isDark ? '#181818' : '#E6E6E6'
  const cachedBackground = backgroundLayers.get(map)
  // getStyle serializes every layer. Tile/style events are frequent, so use
  // the single paint property as the fast path after the first application.
  if (
    cachedBackground &&
    map.getLayer(cachedBackground) &&
    map.getPaintProperty(cachedBackground, 'background-color') === land
  )
    return
  const layers = map.getStyle()?.layers
  const background = layers?.find((layer) => layer.type === 'background')
  if (!layers || !background) return

  backgroundLayers.set(map, background.id)
  // styledata also fires for tile and activity updates. Apply once per base
  // style, including after theme switches; the background is our final marker.
  if (map.getPaintProperty(background.id, 'background-color') === land) return

  for (const layer of layers) {
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
    if (sourceLayer === 'road' && layer.type === 'line') {
      map.setPaintProperty(layer.id, 'line-color', isDark ? '#303030' : '#CECECE')
      map.setPaintProperty(layer.id, 'line-opacity', [
        'interpolate',
        ['linear'],
        ['zoom'],
        10,
        ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], 0.65, 0.08],
        14,
        ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], 0.75, 0.35],
        17,
        0.7,
      ])
    } else if (layer.type === 'fill') {
      if (sourceLayer === 'water') {
        map.setPaintProperty(layer.id, 'fill-color', isDark ? '#252525' : '#D0D0D0')
      } else if (sourceLayer === 'landuse' || sourceLayer === 'landuse_overlay') {
        map.setPaintProperty(layer.id, 'fill-color', isDark ? '#1D1D1D' : '#DEDEDE')
      } else if (sourceLayer === 'building') {
        map.setPaintProperty(layer.id, 'fill-color', isDark ? '#222222' : '#DADADA')
        map.setPaintProperty(layer.id, 'fill-outline-color', isDark ? '#242424' : '#D4D4D4')
      }
    } else if (layer.type === 'symbol') {
      if (sourceLayer === 'poi_label' || sourceLayer === 'airport_label') {
        map.setLayoutProperty(layer.id, 'visibility', 'none')
      } else if (sourceLayer === 'road') {
        // Street names become useful when inspecting an individual route.
        map.setLayerZoomRange(layer.id, Math.max(15, layer.minzoom ?? 0), layer.maxzoom ?? 24)
      }
      if (layer.layout?.['text-field']) {
        map.setPaintProperty(layer.id, 'text-color', isDark ? '#858585' : '#686868')
        map.setPaintProperty(layer.id, 'text-halo-color', land)
        map.setPaintProperty(layer.id, 'text-halo-width', 1)
        map.setPaintProperty(layer.id, 'text-halo-blur', 0)
      }
    }
  }

  map.setPaintProperty(background.id, 'background-color', land)
}
