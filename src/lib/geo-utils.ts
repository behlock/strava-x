import type { LngLat, MapBounds } from '@/models/map'

/** Axis-aligned bounding box of a set of coordinates, or `null` when empty. */
export function boundsOf(coordinates: readonly LngLat[]): MapBounds | null {
  if (coordinates.length === 0) return null
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lng, lat] of coordinates) {
    if (lng < west) west = lng
    if (lng > east) east = lng
    if (lat < south) south = lat
    if (lat > north) north = lat
  }
  if (east - west > 180) {
    let shiftedWest = Infinity,
      shiftedEast = -Infinity
    for (const [lng] of coordinates) {
      const shifted = lng < 0 ? lng + 360 : lng
      shiftedWest = Math.min(shiftedWest, shifted)
      shiftedEast = Math.max(shiftedEast, shifted)
    }
    if (shiftedEast - shiftedWest < east - west) {
      west = shiftedWest
      east = shiftedEast
    }
  }
  return [
    [west, south],
    [east, north],
  ]
}
