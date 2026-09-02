'use client'

import { useEffect, useMemo } from 'react'

import type { Activity } from '@/models/activity'
import type { ActivityCluster } from '@/models/location'
import { clusterActivities } from '@/lib/clusters'
import { readLocalStorage, useLocalStorageItem, writeLocalStorage } from '@/hooks/use-local-storage'

const GEOCODE_CACHE_KEY = 'strava-x-geocode-cache'
// Nominatim's usage policy is ~1 request/second.
const GEOCODE_THROTTLE_MS = 1000

type GeocodeCache = Record<string, string>

function cacheKeyFor(cluster: ActivityCluster): string {
  // Round to 2 decimals (~1km precision) so nearby centroids share an entry.
  return `${cluster.centroid.latitude.toFixed(2)},${cluster.centroid.longitude.toFixed(2)}`
}

function parseCache(raw: string | null): GeocodeCache {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as GeocodeCache) : {}
  } catch {
    return {}
  }
}

function readCache(): GeocodeCache {
  return parseCache(readLocalStorage(GEOCODE_CACHE_KEY))
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Clusters activities by start location and progressively replaces the
 * coordinate-based names with reverse-geocoded city names. Resolved names are
 * cached in localStorage, which is also what drives re-renders here.
 */
export function useActivityClusters(activities: Activity[]): ActivityCluster[] {
  const baseClusters = useMemo(() => clusterActivities(activities), [activities])
  const cacheRaw = useLocalStorageItem(GEOCODE_CACHE_KEY)
  const names = useMemo(() => parseCache(cacheRaw), [cacheRaw])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let throttle = false
      for (const cluster of baseClusters) {
        const key = cacheKeyFor(cluster)
        // Re-read each iteration: another instance of this hook may have
        // resolved the same key in the meantime.
        if (readCache()[key]) continue
        if (throttle) await sleep(GEOCODE_THROTTLE_MS)
        if (cancelled) return
        const name = await fetchCityName(cluster.centroid.latitude, cluster.centroid.longitude)
        throttle = true
        if (cancelled) return
        if (name) writeLocalStorage(GEOCODE_CACHE_KEY, JSON.stringify({ ...readCache(), [key]: name }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [baseClusters])

  return useMemo(
    () =>
      baseClusters.map((cluster) => {
        const name = names[cacheKeyFor(cluster)]
        return name ? { ...cluster, displayName: name } : cluster
      }),
    [baseClusters, names],
  )
}
