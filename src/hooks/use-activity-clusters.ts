import { useMemo, useEffect, useState } from 'react'
import { Activity } from '@/models/activity'
import { ActivityCluster } from '@/models/location'
import { clusterActivities } from '@/lib/clusters'

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

// Reverse geocoding goes through our own /api/geocode/reverse proxy rather
// than hitting Nominatim directly. The proxy hides the user's IP from
// OpenStreetMap and lets the CDN cache repeat lookups.
async function fetchCityName(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`)
    if (!response.ok) return null
    const data = (await response.json()) as { name?: string | null }
    return data.name ?? null
  } catch {
    return null
  }
}

export function useActivityClusters(activities: Activity[]): ActivityCluster[] {
  const baseClusters = useMemo(() => clusterActivities(activities), [activities])

  const [clustersWithNames, setClustersWithNames] = useState<ActivityCluster[]>([])

  useEffect(() => {
    if (baseClusters.length === 0) {
      setClustersWithNames([])
      return
    }

    let cancelled = false
    setClustersWithNames(baseClusters)

    const fetchNames = async () => {
      const cache = getGeocodeCache()
      const newCacheEntries: Record<string, string> = {}

      // First pass: fill in everything available from cache so the user sees
      // city names instantly for previously-seen clusters.
      const working = baseClusters.map((cluster) => {
        const cacheKey = getCacheKey(cluster.centroid.latitude, cluster.centroid.longitude)
        const cachedName = cache[cacheKey]
        return cachedName ? { ...cluster, displayName: cachedName } : cluster
      })
      if (cancelled) return
      setClustersWithNames(working)

      // Second pass: serialize the cache misses to respect Nominatim's
      // ~1 req/sec usage policy. Update state incrementally as each name
      // resolves so the list fills in progressively.
      for (let i = 0; i < baseClusters.length; i++) {
        if (cancelled) return
        const cluster = baseClusters[i]
        const cacheKey = getCacheKey(cluster.centroid.latitude, cluster.centroid.longitude)
        if (cache[cacheKey]) continue

        const cityName = await fetchCityName(cluster.centroid.latitude, cluster.centroid.longitude)
        if (cancelled) return

        if (cityName) {
          newCacheEntries[cacheKey] = cityName
          working[i] = { ...working[i], displayName: cityName }
          setClustersWithNames([...working])
        }

        // Throttle: ~1 req/sec, only between actual network calls.
        if (i < baseClusters.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          if (cancelled) return
        }
      }

      if (Object.keys(newCacheEntries).length > 0) {
        setGeocodeCache({ ...cache, ...newCacheEntries })
      }
    }

    fetchNames()

    return () => {
      cancelled = true
    }
  }, [baseClusters])

  return clustersWithNames
}
