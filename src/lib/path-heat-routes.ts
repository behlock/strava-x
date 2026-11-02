import type { ActivityFeatureCollection } from '@/models/activity'

export const HEAT_TILE_OPTIONS = {
  maxZoom: 16,
  tolerance: 0,
  buffer: 64,
  indexMaxZoom: 5,
  indexMaxPoints: 50_000,
}

/** Split invalid GPS gaps and unwrap dateline crossings before tile clipping. */
export function prepareHeatRoutes(data: ActivityFeatureCollection): ActivityFeatureCollection {
  const features: ActivityFeatureCollection['features'] = []
  for (const feature of data.features) {
    let coordinates: number[][] = []
    const flush = () => {
      if (coordinates.length > 1) features.push({ ...feature, geometry: { type: 'LineString', coordinates } })
      coordinates = []
    }
    for (const p of feature.geometry.coordinates) {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) {
        flush()
        continue
      }
      const previous = coordinates.at(-1)
      const lng = previous ? previous[0] + ((((p[0] - previous[0] + 540) % 360) + 360) % 360) - 180 : p[0]
      coordinates.push([lng, Math.max(-85.05112878, Math.min(85.05112878, p[1]))])
    }
    flush()
  }
  return { type: 'FeatureCollection', features }
}
