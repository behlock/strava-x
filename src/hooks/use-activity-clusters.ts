'use client'

import { useEffect, useMemo, useReducer } from 'react'

import type { Activity } from '@/models/activity'
import type { ActivityCluster } from '@/models/location'
import { clusterActivities } from '@/lib/clusters'
import { readLocalStorage, useLocalStorageItem, writeLocalStorage } from '@/hooks/use-local-storage'

const GEOCODE_CACHE_KEY = 'strava-x-geocode-cache-v2'
// Nominatim's usage policy is ~1 request/second.
const GEOCODE_THROTTLE_MS = 1000
// After a failed lookup (or a 429) leave the key alone for a while instead of
// retrying on every filter change.
const GEOCODE_RETRY_MS = 60_000

type GeocodeCache = Record<string, string>

// Module-level so every instance of the hook (and every restart of the
// effect) shares one throttle window and one view of recent failures.
let lastRequestAt = 0
let rateLimitedUntil = 0
const failedAt = new Map<string, number>()

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

function writeCacheEntry(key: string, name: string): void {
  writeLocalStorage(GEOCODE_CACHE_KEY, JSON.stringify({ ...readCache(), [key]: name }))
}

interface GeocodeResult {
  name: string | null
  rateLimited: boolean
}

// Reverse geocoding goes through our own /api/geocode/reverse proxy rather
// than hitting Nominatim directly. The proxy hides the user's IP from
// OpenStreetMap and lets the CDN cache repeat lookups.
async function fetchCityName(lat: number, lng: number): Promise<GeocodeResult> {
  try {
    // `v=2` busts the edge cache of the previous (borough/district) names.
    const response = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}&v=2`)
    if (!response.ok) return { name: null, rateLimited: response.status === 429 }
    const data = (await response.json()) as { name?: string | null }
    return { name: data.name ?? null, rateLimited: false }
  } catch {
    return { name: null, rateLimited: false }
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
 * Clusters activities by start location and progressively replaces the
 * coordinate-based names with reverse-geocoded city names. Resolved names are
 * cached in localStorage, which is also what drives re-renders here.
 */
export function useActivityClusters(activities: Activity[]): ActivityCluster[] {
  const baseClusters = useMemo(() => clusterActivities(activities), [activities])
  const cacheRaw = useLocalStorageItem(GEOCODE_CACHE_KEY)
  const names = useMemo(() => parseCache(cacheRaw), [cacheRaw])
  const [retryTick, scheduleRetry] = useReducer((n: number) => n + 1, 0)

  // A stable string of the keys still missing a name. The effect below keys
  // on this rather than the activities array, so dragging the date slider
  // (which reshapes clusters but rarely changes which cities they're in)
  // doesn't restart the loop and drop in-flight lookups.
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
        // The key is rounded to ~1km, which is the resolution the cache is
        // keyed at anyway, so geocoding the rounded point is as good as the
        // exact centroid (and lets the CDN cache the lookup).
        const [lat, lng] = key.split(',').map(Number)
        lastRequestAt = Date.now()
        const { name, rateLimited } = await fetchCityName(lat, lng)
        // Store the outcome even if the effect was cancelled meanwhile: the
        // request already cost a Nominatim call, so its answer must not be
        // thrown away — and a failure must not be retried straight away.
        if (name) {
          writeCacheEntry(key, name)
        } else {
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

  return useMemo(
    () =>
      baseClusters.map((cluster) => {
        const name = names[cacheKeyFor(cluster)]
        return name ? { ...cluster, displayName: name } : cluster
      }),
    [baseClusters, names],
  )
}
