import type { Activity } from '@/models/activity'
import { deserializeActivities, type SerializedActivity } from './activities-serialize'

interface PublishedPayload {
  version: number
  updatedAt?: string
  activities: SerializedActivity[]
  tiles?: string
  fullUrl?: string
  heatTiles?: string
}

interface LoadedMap {
  activities: Activity[]
  updatedAt: string | null
  tiles?: string
  fullUrl?: string
  heatTiles?: string
}

// Strict Mode and overlapping mounts share one download and one JSON parse.
// Release settled payloads; later visits recheck whether sharing is still active.
const inFlight = new Map<string, Promise<LoadedMap>>()

export function loadPublishedMap(url: string): Promise<LoadedMap> {
  const existing = inFlight.get(url)
  if (existing) return existing
  const pending = (async () => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error(`fetch_failed_${response.status}`)
    const payload = (await response.json()) as PublishedPayload
    if (!Array.isArray(payload.activities)) throw new Error('malformed_payload')
    if (payload.version !== 1) console.warn('[public-map-view] unknown payload version', payload.version)
    const timestamp = payload.updatedAt
    return {
      fullUrl: payload.fullUrl,
      tiles: payload.tiles,
      heatTiles: payload.heatTiles,
      activities: deserializeActivities(payload.activities),
      updatedAt: typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp)) ? timestamp : null,
    }
  })().finally(() => {
    if (inFlight.get(url) === pending) inFlight.delete(url)
  })
  inFlight.set(url, pending)
  return pending
}
