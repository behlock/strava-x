import { HEAT_TILE_OPTIONS, prepareHeatRoutes } from './path-heat-routes'
import geojsonvt from 'geojson-vt'
import { unpackRoutes, type PackedRoutes } from './packed-routes'
import { HEAT_SIZE, rasterizePathHeat, type HeatFilter, type HeatTileCoordinate } from './path-heat'

export interface HeatRenderRequest {
  routes: PackedRoutes
  tiles: HeatTileCoordinate[]
  filter: HeatFilter
  dark: boolean
}

export type HeatRenderResponse = { images: { coordinate: HeatTileCoordinate; blob: Blob }[] } | { error: true }

self.onmessage = async (event: MessageEvent<HeatRenderRequest>) => {
  const { routes, tiles, filter, dark } = event.data
  try {
    const index = geojsonvt(prepareHeatRoutes(unpackRoutes(routes)), HEAT_TILE_OPTIONS)
    const images = []
    for (const coordinate of tiles) {
      const { z, x, y } = coordinate
      const pixels = rasterizePathHeat(index.getTile(z, ((x % 2 ** z) + 2 ** z) % 2 ** z, y), filter, dark)
      const canvas = new OffscreenCanvas(HEAT_SIZE, HEAT_SIZE)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('canvas_unavailable')
      context.putImageData(new ImageData(pixels, HEAT_SIZE, HEAT_SIZE), 0, 0)
      images.push({ coordinate, blob: await canvas.convertToBlob({ type: 'image/png' }) })
    }
    self.postMessage({ images } satisfies HeatRenderResponse)
  } catch {
    self.postMessage({ error: true } satisfies HeatRenderResponse)
  }
}
