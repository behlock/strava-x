import type { Activity } from '@/models/activity'
import type { ActivityCluster } from '@/models/location'
import { haversineDistance } from '@/lib/geo-utils'

const CLUSTER_DISTANCE_KM = 15

interface LatLng {
  latitude: number
  longitude: number
}

interface ActivityWithLocation extends LatLng {
  activity: Activity
}

function getActivityStartLocation(activity: Activity): LatLng | null {
  const start = activity.feature?.geometry.coordinates[0]
  if (!start) return null
  const [longitude, latitude] = start
  return { latitude, longitude }
}

function formatCoordinate(value: number, isLatitude: boolean): string {
  const direction = isLatitude ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'
  return `${Math.abs(value).toFixed(1)}°${direction}`
}

function formatFallbackName(lat: number, lng: number): string {
  return `${formatCoordinate(lat, true)}, ${formatCoordinate(lng, false)}`
}

function summarize(locations: LatLng[]): Pick<ActivityCluster, 'centroid' | 'bounds'> {
  let sumLat = 0
  let sumLng = 0
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const { latitude, longitude } of locations) {
    sumLat += latitude
    sumLng += longitude
    if (latitude < minLat) minLat = latitude
    if (latitude > maxLat) maxLat = latitude
    if (longitude < minLng) minLng = longitude
    if (longitude > maxLng) maxLng = longitude
  }
  return {
    centroid: { latitude: sumLat / locations.length, longitude: sumLng / locations.length },
    bounds: { minLat, maxLat, minLng, maxLng },
  }
}

// Greedy single-linkage clustering: an activity joins a cluster when it starts
// within CLUSTER_DISTANCE_KM of any member. Quadratic in the worst case, but
// activity counts are in the low thousands and this runs inside a useMemo.
function clusterByDistance(items: ActivityWithLocation[]): ActivityCluster[] {
  const assigned = new Set<string>()
  const clusters: ActivityCluster[] = []

  for (const seed of items) {
    if (assigned.has(seed.activity.id)) continue
    const members: ActivityWithLocation[] = [seed]
    assigned.add(seed.activity.id)

    let grew = true
    while (grew) {
      grew = false
      for (const candidate of items) {
        if (assigned.has(candidate.activity.id)) continue
        const near = members.some(
          (m) =>
            haversineDistance(m.latitude, m.longitude, candidate.latitude, candidate.longitude) <= CLUSTER_DISTANCE_KM,
        )
        if (near) {
          members.push(candidate)
          assigned.add(candidate.activity.id)
          grew = true
        }
      }
    }

    const { centroid, bounds } = summarize(members)
    clusters.push({
      // Centroid-derived id (~1km precision) — stable across re-clusters and
      // filter changes, so the user's selection survives when the same city
      // re-appears with a different ranking.
      id: `${centroid.latitude.toFixed(2)},${centroid.longitude.toFixed(2)}`,
      centroid,
      bounds,
      activityIds: members.map((m) => m.activity.id),
      activityCount: members.length,
      displayName: formatFallbackName(centroid.latitude, centroid.longitude),
    })
  }

  return clusters.sort((a, b) => b.activityCount - a.activityCount)
}

/**
 * Pure, synchronous clustering of activities by their start coordinates,
 * sorted by activity count descending. Display names are coordinate-based;
 * `useActivityClusters` layers reverse-geocoded city names on top.
 */
export function clusterActivities(activities: Activity[]): ActivityCluster[] {
  const items: ActivityWithLocation[] = []
  for (const activity of activities) {
    const location = getActivityStartLocation(activity)
    if (location) items.push({ activity, ...location })
  }
  return clusterByDistance(items)
}
