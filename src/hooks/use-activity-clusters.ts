import { useMemo, useEffect, useState } from 'react'
import { Activity } from '@/models/activity'
import { ActivityCluster } from '@/models/location'
import { haversineDistance } from '@/lib/geo-utils'

const CLUSTER_DISTANCE_KM = 15
const MIN_ACTIVITIES = 3

interface ActivityWithLocation {
  activity: Activity
  latitude: number
  longitude: number
}

function formatCoordinate(value: number, isLatitude: boolean): string {
  const direction = isLatitude ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'
  return `${Math.abs(value).toFixed(1)}°${direction}`
}

function formatFallbackName(lat: number, lng: number): string {
  return `${formatCoordinate(lat, true)}, ${formatCoordinate(lng, false)}`
}

// Geocoding cache helpers
const GEOCODE_CACHE_KEY = 'strava-x-geocode-cache'

function getCacheKey(lat: number, lng: number): string {
  // Round to 2 decimals (~1km precision) for cache key
  return `${lat.toFixed(2)},${lng.toFixed(2)}`
}

function getGeocodeCache(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const cached = localStorage.getItem(GEOCODE_CACHE_KEY)
    return cached ? JSON.parse(cached) : {}
  } catch {
    return {}
  }
}

function setGeocodeCache(cache: Record<string, string>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage might be full or disabled
  }
}

function getActivityStartLocation(activity: Activity): { latitude: number; longitude: number } | null {
  const coords = activity.feature?.geometry.coordinates
  if (!coords || coords.length === 0) return null
  const [longitude, latitude] = coords[0]
  return { latitude, longitude }
}

function calculateCentroid(locations: { latitude: number; longitude: number }[]): { latitude: number; longitude: number } {
  if (locations.length === 0) return { latitude: 0, longitude: 0 }

  const sum = locations.reduce(
    (acc, loc) => ({
      latitude: acc.latitude + loc.latitude,
      longitude: acc.longitude + loc.longitude,
    }),
    { latitude: 0, longitude: 0 }
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
  if (locations.length === 0) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 }
  }

  return locations.reduce(
    (bounds, loc) => ({
      minLat: Math.min(bounds.minLat, loc.latitude),
      maxLat: Math.max(bounds.maxLat, loc.latitude),
      minLng: Math.min(bounds.minLng, loc.longitude),
      maxLng: Math.max(bounds.maxLng, loc.longitude),
    }),
    {
      minLat: Infinity,
      maxLat: -Infinity,
      minLng: Infinity,
      maxLng: -Infinity,
    }
  )
}

function clusterActivities(activitiesWithLocation: ActivityWithLocation[]): ActivityCluster[] {
  if (activitiesWithLocation.length === 0) return []

  const assigned = new Set<string>()
  const clusters: ActivityCluster[] = []

  for (const item of activitiesWithLocation) {
    if (assigned.has(item.activity.id)) continue

    // Start a new cluster with this activity
    const clusterMembers: ActivityWithLocation[] = [item]
    assigned.add(item.activity.id)

    // Find all unassigned activities within CLUSTER_DISTANCE_KM of any member
    let addedNew = true
    while (addedNew) {
      addedNew = false
      for (const candidate of activitiesWithLocation) {
        if (assigned.has(candidate.activity.id)) continue

        // Check if candidate is within distance of any cluster member
        for (const member of clusterMembers) {
          const distance = haversineDistance(
            member.latitude,
            member.longitude,
            candidate.latitude,
            candidate.longitude
          )
          if (distance <= CLUSTER_DISTANCE_KM) {
            clusterMembers.push(candidate)
            assigned.add(candidate.activity.id)
            addedNew = true
            break
          }
        }
      }
    }

    // Only keep clusters with minimum activities
    if (clusterMembers.length >= MIN_ACTIVITIES) {
      const locations = clusterMembers.map((m) => ({ latitude: m.latitude, longitude: m.longitude }))
      const centroid = calculateCentroid(locations)
      const bounds = calculateBounds(locations)

      clusters.push({
        id: `cluster-${clusters.length}`,
        centroid,
        bounds,
        activityIds: clusterMembers.map((m) => m.activity.id),
        activityCount: clusterMembers.length,
        displayName: formatFallbackName(centroid.latitude, centroid.longitude),
      })
    }
  }

  // Sort by activity count descending
  return clusters.sort((a, b) => b.activityCount - a.activityCount)
}

async function fetchCityName(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
      {
        headers: {
          'User-Agent': 'strava-x/1.0',
        },
      }
    )
    if (!response.ok) return null
    const data = await response.json()
    // Try to get city, town, village, or county
    const address = data.address
    return address?.city || address?.town || address?.village || address?.county || address?.state || null
  } catch {
    return null
  }
}

export function useActivityClusters(activities: Activity[]): ActivityCluster[] {
  const baseClusters = useMemo(() => {
    // Extract activities with valid starting locations
    const activitiesWithLocation: ActivityWithLocation[] = []

    for (const activity of activities) {
      const location = getActivityStartLocation(activity)
      if (location) {
        activitiesWithLocation.push({
          activity,
          latitude: location.latitude,
          longitude: location.longitude,
        })
      }
    }

    return clusterActivities(activitiesWithLocation)
  }, [activities])

  const [clustersWithNames, setClustersWithNames] = useState<ActivityCluster[]>([])

  useEffect(() => {
    if (baseClusters.length === 0) {
      setClustersWithNames([])
      return
    }

    // Start with base clusters (showing coordinates)
    setClustersWithNames(baseClusters)

    // Fetch city names for each cluster (with caching)
    const fetchNames = async () => {
      const cache = getGeocodeCache()
      const newCacheEntries: Record<string, string> = {}

      const updatedClusters = await Promise.all(
        baseClusters.map(async (cluster) => {
          const cacheKey = getCacheKey(cluster.centroid.latitude, cluster.centroid.longitude)

          // Check cache first
          if (cache[cacheKey]) {
            return {
              ...cluster,
              displayName: cache[cacheKey],
            }
          }

          // Fetch from API if not cached
          const cityName = await fetchCityName(cluster.centroid.latitude, cluster.centroid.longitude)
          const displayName = cityName || formatFallbackName(cluster.centroid.latitude, cluster.centroid.longitude)

          // Save to cache if we got a city name
          if (cityName) {
            newCacheEntries[cacheKey] = displayName
          }

          return {
            ...cluster,
            displayName,
          }
        })
      )

      // Update cache with new entries
      if (Object.keys(newCacheEntries).length > 0) {
        setGeocodeCache({ ...cache, ...newCacheEntries })
      }

      setClustersWithNames(updatedClusters)
    }

    fetchNames()
  }, [baseClusters])

  return clustersWithNames
}
