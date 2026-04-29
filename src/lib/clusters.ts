import { Activity } from '@/models/activity'
import { ActivityCluster } from '@/models/location'
import { haversineDistance } from '@/lib/geo-utils'

const CLUSTER_DISTANCE_KM = 15
const MIN_ACTIVITIES = 1

interface ActivityWithLocation {
  activity: Activity
  latitude: number
  longitude: number
}

export function getActivityStartLocation(activity: Activity): { latitude: number; longitude: number } | null {
  const coords = activity.feature?.geometry.coordinates
  if (!coords || coords.length === 0) return null
  const [longitude, latitude] = coords[0]
  return { latitude, longitude }
}

function formatCoordinate(value: number, isLatitude: boolean): string {
  const direction = isLatitude ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'
  return `${Math.abs(value).toFixed(1)}°${direction}`
}

export function formatFallbackName(lat: number, lng: number): string {
  return `${formatCoordinate(lat, true)}, ${formatCoordinate(lng, false)}`
}

function calculateCentroid(locations: { latitude: number; longitude: number }[]): {
  latitude: number
  longitude: number
} {
  if (locations.length === 0) return { latitude: 0, longitude: 0 }
  const sum = locations.reduce(
    (acc, loc) => ({
      latitude: acc.latitude + loc.latitude,
      longitude: acc.longitude + loc.longitude,
    }),
    { latitude: 0, longitude: 0 },
  )
  return {
    latitude: sum.latitude / locations.length,
    longitude: sum.longitude / locations.length,
  }
}

function calculateBounds(locations: { latitude: number; longitude: number }[]): {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
} {
  if (locations.length === 0) return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 }
  return locations.reduce(
    (bounds, loc) => ({
      minLat: Math.min(bounds.minLat, loc.latitude),
      maxLat: Math.max(bounds.maxLat, loc.latitude),
      minLng: Math.min(bounds.minLng, loc.longitude),
      maxLng: Math.max(bounds.maxLng, loc.longitude),
    }),
    { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity },
  )
}

function clusterByDistance(activitiesWithLocation: ActivityWithLocation[]): ActivityCluster[] {
  if (activitiesWithLocation.length === 0) return []

  const assigned = new Set<string>()
  const clusters: ActivityCluster[] = []

  for (const item of activitiesWithLocation) {
    if (assigned.has(item.activity.id)) continue

    const clusterMembers: ActivityWithLocation[] = [item]
    assigned.add(item.activity.id)

    let addedNew = true
    while (addedNew) {
      addedNew = false
      for (const candidate of activitiesWithLocation) {
        if (assigned.has(candidate.activity.id)) continue
        for (const member of clusterMembers) {
          const distance = haversineDistance(member.latitude, member.longitude, candidate.latitude, candidate.longitude)
          if (distance <= CLUSTER_DISTANCE_KM) {
            clusterMembers.push(candidate)
            assigned.add(candidate.activity.id)
            addedNew = true
            break
          }
        }
      }
    }

    if (clusterMembers.length >= MIN_ACTIVITIES) {
      const locations = clusterMembers.map((m) => ({ latitude: m.latitude, longitude: m.longitude }))
      const centroid = calculateCentroid(locations)
      const bounds = calculateBounds(locations)
      // Centroid-derived id (~1km precision) — stable across re-clusters and
      // filter changes, so the user's selection survives when the same city
      // re-appears with a different ranking.
      const id = `${centroid.latitude.toFixed(2)},${centroid.longitude.toFixed(2)}`
      clusters.push({
        id,
        centroid,
        bounds,
        activityIds: clusterMembers.map((m) => m.activity.id),
        activityCount: clusterMembers.length,
        displayName: formatFallbackName(centroid.latitude, centroid.longitude),
      })
    }
  }

  return clusters.sort((a, b) => b.activityCount - a.activityCount)
}

/**
 * Pure, sync clustering of activities by their start coordinates. Returns
 * clusters of >= 3 activities within 15km of each other, sorted by count desc.
 * Display names are coordinate-based; geocoding is layered on top by
 * `useActivityClusters`.
 */
export function clusterActivities(activities: Activity[]): ActivityCluster[] {
  const activitiesWithLocation: ActivityWithLocation[] = []
  for (const activity of activities) {
    const location = getActivityStartLocation(activity)
    if (!location) continue
    activitiesWithLocation.push({
      activity,
      latitude: location.latitude,
      longitude: location.longitude,
    })
  }
  return clusterByDistance(activitiesWithLocation)
}
