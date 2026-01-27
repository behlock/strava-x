/**
 * Calculate distance between two GPS coordinates using the Haversine formula
 * @param lat1 Latitude of first point in degrees
 * @param lon1 Longitude of first point in degrees
 * @param lat2 Latitude of second point in degrees
 * @param lon2 Longitude of second point in degrees
 * @returns Distance in kilometers
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371 // Earth's radius in kilometers

  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}

/**
 * Calculate total distance from an array of coordinates
 * @param coordinates Array of [longitude, latitude] pairs
 * @returns Total distance in kilometers
 */
export function calculateTotalDistance(coordinates: number[][]): number {
  if (!coordinates || coordinates.length < 2) {
    return 0
  }

  let totalDistance = 0

  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1]
    const [lon2, lat2] = coordinates[i]
    totalDistance += haversineDistance(lat1, lon1, lat2, lon2)
  }

  return totalDistance
}

/**
 * Calculate total elevation gain from track points
 * Only counts positive elevation changes (climbing)
 * @param elevations Array of elevation values in meters
 * @returns Total elevation gain in meters
 */
export function calculateElevationGain(elevations: number[]): number {
  if (!elevations || elevations.length < 2) {
    return 0
  }

  let totalGain = 0

  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1]
    if (diff > 0) {
      totalGain += diff
    }
  }

  return totalGain
}

/**
 * Format distance for display
 * @param km Distance in kilometers
 * @returns Formatted string (e.g., "12.5 km" or "850 m")
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`
  }
  return `${km.toFixed(1)} km`
}

/**
 * Format elevation for display
 * @param meters Elevation in meters
 * @returns Formatted string (e.g., "1,234 m")
 */
export function formatElevation(meters: number): string {
  return `${Math.round(meters).toLocaleString()} m`
}
