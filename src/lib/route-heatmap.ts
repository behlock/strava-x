import type { FeatureCollection, Point } from 'geojson'
import type { ActivityFeatureCollection } from '@/models/activity'

type RouteHeatmapData = FeatureCollection<Point, { id: string; type: string; dateTs: number; weight: number }>
export interface RouteHeatmapSources {
  own: ActivityFeatureCollection
  other: ActivityFeatureCollection
  overlap: ActivityFeatureCollection
}
export type RouteHeatmaps = Record<keyof RouteHeatmapSources, string>

const SPACING_METRES = 100
const MAX_POINTS = 1_000_000
const RADIANS = Math.PI / 180

function valid(p: number[]): boolean {
  return Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90
}
function longitudeDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180
}
function distance(a: number[], b: number[]): number {
  const lat = Math.sin(((b[1] - a[1]) * RADIANS) / 2)
  const lng = Math.sin((longitudeDelta(a[0], b[0]) * RADIANS) / 2)
  const h = lat * lat + Math.cos(a[1] * RADIANS) * Math.cos(b[1] * RADIANS) * lng * lng
  return 2 * 6_371_000 * Math.asin(Math.sqrt(Math.min(1, h)))
}

/** Equal-distance samples: denser GPS recording must not look like more visits. */
export function sampleRouteHeatmap(data: ActivityFeatureCollection, maxPoints = MAX_POINTS): RouteHeatmapData {
  const result: RouteHeatmapData = { type: 'FeatureCollection', features: [] }
  for (const feature of data.features) {
    const coordinates = feature.geometry.coordinates
    const segments: { a: number[]; b: number[]; length: number }[] = []
    let total = 0
    for (let i = 1; i < coordinates.length; i++) {
      const a = coordinates[i - 1],
        b = coordinates[i]
      if (!valid(a) || !valid(b)) continue
      const length = distance(a, b)
      if (length < 0.001) continue
      segments.push({ a, b, length })
      total += length
    }
    if (!segments.length) continue
    const count = Math.ceil(total / SPACING_METRES)
    if (result.features.length + count > maxPoints) throw new Error('heatmap_too_large')
    const step = total / count
    let segmentIndex = 0,
      travelled = 0
    for (let i = 0; i < count; i++) {
      const target = (i + 0.5) * step
      while (segmentIndex < segments.length - 1 && travelled + segments[segmentIndex].length < target) {
        travelled += segments[segmentIndex++].length
      }
      const { a, b, length } = segments[segmentIndex]
      const fraction = (target - travelled) / length
      result.features.push({
        type: 'Feature',
        properties: { ...feature.properties, weight: step / SPACING_METRES },
        geometry: {
          type: 'Point',
          coordinates: [
            ((a[0] + longitudeDelta(a[0], b[0]) * fraction + 540) % 360) - 180,
            a[1] + (b[1] - a[1]) * fraction,
          ],
        },
      })
    }
  }
  return result
}
