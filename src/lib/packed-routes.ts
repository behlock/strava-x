import type { ActivityFeatureCollection } from '@/models/activity'

/** Float64 preserves the existing corridor geometry, including dateline coordinates. */
export interface PackedRoutes {
  coordinates: Float64Array
  offsets: Uint32Array
  properties: ActivityFeatureCollection['features'][number]['properties'][]
}
export function packRoutes(data: ActivityFeatureCollection): PackedRoutes {
  const offsets = new Uint32Array(data.features.length + 1)
  let count = 0
  for (let i = 0; i < data.features.length; i++) {
    offsets[i] = count
    count += data.features[i].geometry.coordinates.length
  }
  offsets[data.features.length] = count
  const coordinates = new Float64Array(count * 2)
  let cursor = 0
  for (const feature of data.features)
    for (const p of feature.geometry.coordinates) {
      coordinates[cursor++] = p[0]
      coordinates[cursor++] = p[1]
    }
  return { coordinates, offsets, properties: data.features.map((f) => f.properties) }
}
export function unpackRoutes(packed: PackedRoutes): ActivityFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: packed.properties.map((properties, i) => {
      const coordinates: number[][] = []
      for (let p = packed.offsets[i]; p < packed.offsets[i + 1]; p++)
        coordinates.push([packed.coordinates[p * 2], packed.coordinates[p * 2 + 1]])
      return { type: 'Feature', properties, geometry: { type: 'LineString', coordinates } }
    }),
  }
}
export function routeTransfers(packed: PackedRoutes): ArrayBuffer[] {
  return [packed.coordinates.buffer as ArrayBuffer, packed.offsets.buffer as ArrayBuffer]
}
