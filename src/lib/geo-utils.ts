import type { LngLat, MapBounds } from '@/models/map'

const EARTH_RADIUS_KM = 6371

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}

/** Great-circle distance between two points in kilometers (Haversine formula). */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

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
  return [
    [west, south],
    [east, north],
  ]
}
