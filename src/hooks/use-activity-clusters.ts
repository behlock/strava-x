'use client'

import { useEffect, useMemo, useReducer } from 'react'

import type { Activity } from '@/models/activity'
import type { ActivityCluster } from '@/models/location'
import type { ResolvedCity } from '@/lib/city-names'
import { clusterActivities, filterActivityClusters, mergeClustersByLocation } from '@/lib/clusters'
import { readLocalStorage, useLocalStorageItem, writeLocalStorage } from '@/hooks/use-local-storage'

const GEOCODE_CACHE_KEY = 'strava-x-geocode-cache-v4'
// Nominatim's usage policy is ~1 request/second.
const GEOCODE_THROTTLE_MS = 1000
// Back off failed lookups across filter changes.
const GEOCODE_RETRY_MS = 60_000

type GeocodeCache = Record<string, ResolvedCity>

// Share throttling and backoff across hook instances.
let lastRequestAt = 0
let rateLimitedUntil = 0
const failedAt = new Map<string, number>()

function cacheKeyFor(cluster: ActivityCluster): string {
  return `${cluster.centroid.latitude.toFixed(4)},${cluster.centroid.longitude.toFixed(4)}`
}

function parseCache(raw: string | null): GeocodeCache {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.fromEntries(
          Object.entries(parsed).filter(
            ([, city]) =>
              city && typeof city === 'object' && typeof city.id === 'string' && typeof city.name === 'string',
          ),
        )
      : {}
  } catch {
    return {}
  }
}

function readCache(): GeocodeCache {
  return parseCache(readLocalStorage(GEOCODE_CACHE_KEY))
}

function writeCacheEntry(key: string, city: ResolvedCity): void {
  writeLocalStorage(GEOCODE_CACHE_KEY, JSON.stringify({ ...readCache(), [key]: city }))
}

interface GeocodeResult {
  city: ResolvedCity | null
  rateLimited: boolean
}

async function fetchCity(lat: number, lng: number): Promise<GeocodeResult> {
  try {
    // A new version bypasses cached labels from the old city-specific rules.
    const response = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}&v=4`)
    if (!response.ok) return { city: null, rateLimited: response.status === 429 }
    const data = (await response.json()) as { city?: ResolvedCity | null }
    return { city: data.city ?? null, rateLimited: false }
  } catch {
    return { city: null, rateLimited: false }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** When this key can next be tried: now if never failed, else failure + backoff. */
function retryAfter(key: string): number {
  return Math.max(rateLimitedUntil, (failedAt.get(key) ?? 0) + GEOCODE_RETRY_MS)
}

/**
 * Clusters activities by start location, replaces coordinate names with
 * reverse-geocoded city names, then merges clusters that share a city.
 * Resolved names are cached in localStorage, which also drives re-renders.
 */
export function useActivityClusters(
  activities: Activity[],
  visibleActivities: Activity[] = activities,
): ActivityCluster[] {
  const baseClusters = useMemo(() => clusterActivities(activities), [activities])
  const cacheRaw = useLocalStorageItem(GEOCODE_CACHE_KEY)
  const names = useMemo(() => parseCache(cacheRaw), [cacheRaw])
  const [retryTick, scheduleRetry] = useReducer((n: number) => n + 1, 0)

  // Stable keys keep timeline changes from restarting in-flight geocoding.
  const pendingKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const cluster of baseClusters) {
      const key = cacheKeyFor(cluster)
      if (!names[key]) keys.add(key)
    }
    return [...keys].join('|')
  }, [baseClusters, names])

  useEffect(() => {
    if (!pendingKeys) return
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    ;(async () => {
      let earliestRetry = Infinity
      for (const key of pendingKeys.split('|')) {
        // Re-read each iteration: another instance of this hook may have
        // resolved the same key in the meantime.
        if (readCache()[key]) continue
        const notBefore = retryAfter(key)
        if (notBefore > Date.now()) {
          earliestRetry = Math.min(earliestRetry, notBefore)
          continue
        }
        const wait = lastRequestAt + GEOCODE_THROTTLE_MS - Date.now()
        if (wait > 0) await sleep(wait)
        if (cancelled) return
        // Geocode the rounded cache key so nearby requests share CDN results.
        const [lat, lng] = key.split(',').map(Number)
        lastRequestAt = Date.now()
        const { city, rateLimited } = await fetchCity(lat, lng)
        // Cache completed calls even after cancellation to avoid duplicate requests.
        if (city) {
          failedAt.delete(key)
          writeCacheEntry(key, city)
        } else {
          if (failedAt.size >= 1000) failedAt.delete(failedAt.keys().next().value!)
          failedAt.set(key, Date.now())
          if (rateLimited) rateLimitedUntil = Date.now() + GEOCODE_RETRY_MS
          earliestRetry = Math.min(earliestRetry, retryAfter(key))
        }
        if (cancelled) return
      }
      // Come back for the backed-off keys once their window has passed.
      if (earliestRetry !== Infinity) {
        retryTimer = setTimeout(scheduleRetry, Math.max(0, earliestRetry - Date.now()))
      }
    })()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [pendingKeys, retryTick])

  const labeledClusters = useMemo(() => {
    const labeled = baseClusters.map((cluster) => {
      const city = names[cacheKeyFor(cluster)]
      return city ? { ...cluster, displayName: city.name, id: city.id } : cluster
    })
    return mergeClustersByLocation(labeled)
  }, [baseClusters, names])
  return useMemo(
    () =>
      visibleActivities === activities ? labeledClusters : filterActivityClusters(labeledClusters, visibleActivities),
    [activities, visibleActivities, labeledClusters],
  )
}
