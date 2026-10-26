import { boundsOf } from './geo-utils'
import type { Activity } from '@/models/activity'
import type { ActivityCluster } from '@/models/location'

// Geocode buckets, not the final locations list. Same-city buckets are merged
// after reverse geocoding; 15km keeps Nominatim calls to one per hub.
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
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
    return null
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
  const [[minLng, minLat], [maxLng, maxLat]] = boundsOf(
    locations.map(({ latitude, longitude }) => [longitude, latitude]),
  )!
  let sumLat = 0,
    sumLng = 0
  for (const { latitude, longitude } of locations) {
    sumLat += latitude
    sumLng += maxLng > 180 && longitude < 0 ? longitude + 360 : longitude
  }
  const longitude = ((sumLng / locations.length + 540) % 360) - 180
  return { centroid: { latitude: sumLat / locations.length, longitude }, bounds: { minLng, maxLng, minLat, maxLat } }
}

interface SpatialCell {
  id: number
  x: number
  y: number
  z: number
  points: { vector: [number, number, number] }[]
}

// Work on the unit sphere so the index remains accurate near the poles and
// across the date line. A cell's diagonal is at most the cluster distance;
// every activity in one cell therefore belongs to the same component.
const CHORD = 2 * Math.sin(CLUSTER_DISTANCE_KM / (2 * 6371))
const CELL_SIZE = CHORD / Math.sqrt(3)
const MAX_DISTANCE_SQUARED = CHORD * CHORD

function clusterByDistance(items: ActivityWithLocation[]): ActivityCluster[] {
  const cells = new Map<string, SpatialCell>()
  const indexed: { item: ActivityWithLocation; cell: SpatialCell }[] = []
  const seenIds = new Set<string>()
  for (const item of items) {
    if (seenIds.has(item.activity.id)) continue
    seenIds.add(item.activity.id)
    const lat = (item.latitude * Math.PI) / 180
    const lng = (item.longitude * Math.PI) / 180
    const vector: [number, number, number] = [
      Math.cos(lat) * Math.cos(lng),
      Math.cos(lat) * Math.sin(lng),
      Math.sin(lat),
    ]
    const [x, y, z] = vector.map((value) => Math.floor(value / CELL_SIZE))
    const key = `${x},${y},${z}`
    let cell = cells.get(key)
    if (!cell) {
      cell = { id: cells.size, x, y, z, points: [] }
      cells.set(key, cell)
    }
    cell.points.push({ vector })
    indexed.push({ item, cell })
  }

  const parents = Array.from({ length: cells.size }, (_, index) => index)
  const find = (id: number): number => {
    while (parents[id] !== id) {
      parents[id] = parents[parents[id]]
      id = parents[id]
    }
    return id
  }
  for (const cell of cells.values()) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          const other = cells.get(`${cell.x + dx},${cell.y + dy},${cell.z + dz}`)
          if (!other || other.id <= cell.id || find(cell.id) === find(other.id)) continue
          let connected = false
          for (const a of cell.points) {
            for (const b of other.points) {
              const distance =
                (a.vector[0] - b.vector[0]) ** 2 + (a.vector[1] - b.vector[1]) ** 2 + (a.vector[2] - b.vector[2]) ** 2
              if (distance <= MAX_DISTANCE_SQUARED) {
                parents[find(other.id)] = find(cell.id)
                connected = true
                break
              }
            }
            if (connected) break
          }
        }
      }
    }
  }

  const groups = new Map<number, ActivityWithLocation[]>()
  for (const { item, cell } of indexed) {
    const root = find(cell.id)
    const group = groups.get(root)
    if (group) group.push(item)
    else groups.set(root, [item])
  }
  return [...groups.values()]
    .map((members) => {
      const { centroid, bounds } = summarize(members)
      return {
        id: `${centroid.latitude.toFixed(2)},${centroid.longitude.toFixed(2)}`,
        centroid,
        bounds,
        activityIds: members.map((member) => member.activity.id),
        activityCount: members.length,
        displayName: formatFallbackName(centroid.latitude, centroid.longitude),
      }
    })
    .sort((a, b) => b.activityCount - a.activityCount)
}

function combineClusters(group: ActivityCluster[]): ActivityCluster {
  const [[minLng, minLat], [maxLng, maxLat]] = boundsOf(
    group.flatMap(({ bounds }) => [
      [bounds.minLng, bounds.minLat],
      [bounds.maxLng, bounds.maxLat],
    ]),
  )!
  let sumLat = 0
  let sumLng = 0
  let count = 0
  const activityIds: string[] = []
  for (const c of group) {
    sumLat += c.centroid.latitude * c.activityCount
    sumLng +=
      (maxLng > 180 && c.centroid.longitude < 0 ? c.centroid.longitude + 360 : c.centroid.longitude) * c.activityCount
    count += c.activityCount
    activityIds.push(...c.activityIds)
  }
  return {
    id: group[0].id,
    centroid: { latitude: sumLat / count, longitude: ((sumLng / count + 540) % 360) - 180 },
    bounds: { minLat, maxLat, minLng, maxLng },
    activityIds,
    activityCount: count,
    displayName: group[0].displayName,
  }
}

/** Merge resolved place identities, never names shared by unrelated cities. */
export function mergeClustersByLocation(clusters: ActivityCluster[]): ActivityCluster[] {
  const groups = new Map<string, ActivityCluster[]>()
  for (const cluster of clusters) {
    const group = groups.get(cluster.id)
    if (group) group.push(cluster)
    else groups.set(cluster.id, [cluster])
  }
  return [...groups.values()]
    .map((group) => (group.length === 1 ? group[0] : combineClusters(group)))
    .sort((a, b) => b.activityCount - a.activityCount)
}

const clusterCache = new WeakMap<Activity[], ActivityCluster[]>()

/** Group start coordinates by proximity, largest first; city names are resolved separately. */
export function clusterActivities(activities: Activity[]): ActivityCluster[] {
  const cached = clusterCache.get(activities)
  if (cached) return cached
  const items: ActivityWithLocation[] = []
  for (const activity of activities) {
    const location = getActivityStartLocation(activity)
    if (location) items.push({ activity, ...location })
  }
  const clusters = clusterByDistance(items)
  clusterCache.set(activities, clusters)
  return clusters
}

/** Reuse geographic groups while filters change; no distance checks or new geocode keys. */
export function filterActivityClusters(clusters: ActivityCluster[], activities: Activity[]): ActivityCluster[] {
  const active = new Map(activities.map((activity) => [activity.id, activity]))
  return clusters
    .flatMap((cluster) => {
      const activityIds = cluster.activityIds.filter((id) => active.has(id))
      if (activityIds.length === 0) return []
      if (activityIds.length === cluster.activityIds.length) return [cluster]
      const starts = activityIds.flatMap((id) => {
        const start = getActivityStartLocation(active.get(id)!)
        return start ? [start] : []
      })
      return [{ ...cluster, ...summarize(starts), activityIds, activityCount: activityIds.length }]
    })
    .sort((a, b) => b.activityCount - a.activityCount)
}
