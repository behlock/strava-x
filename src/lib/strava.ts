import type { Activity, ActivityFeature } from '@/models/activity'
import { config } from '@/lib/config'

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize'
const STRAVA_API = 'https://www.strava.com/api/v3'

export interface StravaTokens {
  access_token: string
  refresh_token: string
  expires_at: number // unix seconds
  athlete_id?: number
}

interface StravaSummaryActivity {
  id: number
  name: string
  distance: number // meters
  total_elevation_gain: number // meters
  start_date: string
  sport_type: string
  type?: string
  map?: {
    id?: string
    summary_polyline?: string | null
  }
}

export function getClientId(): string {
  if (!config.STRAVA_CLIENT_ID) throw new Error('NEXT_PUBLIC_STRAVA_CLIENT_ID is not set')
  return config.STRAVA_CLIENT_ID
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state,
  })
  return `${STRAVA_AUTH_URL}?${params.toString()}`
}

// Map Strava sport_type to our four categories. Unknown types fall through to
// the raw lowercased sport_type — they simply won't match the default filters.
const SPORT_TYPE_MAP: Record<string, string> = {
  Ride: 'cycling',
  GravelRide: 'cycling',
  MountainBikeRide: 'cycling',
  EBikeRide: 'cycling',
  EMountainBikeRide: 'cycling',
  VirtualRide: 'cycling',
  Handcycle: 'cycling',
  Velomobile: 'cycling',
  Run: 'running',
  TrailRun: 'running',
  VirtualRun: 'running',
  Walk: 'walking',
  Hike: 'hiking',
}

function mapSportType(sportType: string): string {
  return SPORT_TYPE_MAP[sportType] ?? sportType.toLowerCase()
}

// Google encoded polyline decoder — returns [lng, lat] pairs (GeoJSON order).
export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0
  const len = encoded.length

  while (index < len) {
    let result = 0
    let shift = 0
    let b: number
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dLat = result & 1 ? ~(result >> 1) : result >> 1
    lat += dLat

    result = 0
    shift = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dLng = result & 1 ? ~(result >> 1) : result >> 1
    lng += dLng

    coords.push([lng * 1e-5, lat * 1e-5])
  }
  return coords
}

export function summaryToActivity(s: StravaSummaryActivity): Activity {
  const polyline = s.map?.summary_polyline
  let feature: ActivityFeature | null = null
  if (polyline) {
    const coordinates = decodePolyline(polyline)
    if (coordinates.length >= 2) {
      feature = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: {},
      }
    }
  }
  return {
    id: `strava-${s.id}`,
    type: mapSportType(s.sport_type),
    date: new Date(s.start_date),
    feature,
    distance: s.distance / 1000,
    elevationGain: s.total_elevation_gain,
  }
}

interface FetchOptions {
  onProgress?: (fetched: number) => void
  onBatch?: (batch: Activity[]) => void
  signal?: AbortSignal
}

const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 1000

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

async function fetchWithRetry(url: string, accessToken: string, signal: AbortSignal | undefined): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    })
    if (res.status === 401) throw new Error('strava_unauthorized')
    if (res.ok) return res

    const isRateLimited = res.status === 429
    const isServerError = res.status >= 500 && res.status < 600
    if (!isRateLimited && !isServerError) throw new Error(`strava_fetch_failed_${res.status}`)
    if (attempt === MAX_RETRIES) {
      throw new Error(isRateLimited ? 'strava_rate_limited' : `strava_fetch_failed_${res.status}`)
    }

    // Honor Retry-After header on 429 when present, otherwise exponential backoff.
    const retryAfter = Number(res.headers.get('Retry-After'))
    const delay =
      isRateLimited && Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : BASE_BACKOFF_MS * 2 ** attempt
    await sleep(delay, signal)
  }
  // Unreachable
  throw new Error('strava_fetch_failed')
}

export async function fetchAllActivities(
  accessToken: string,
  { onProgress, onBatch, signal }: FetchOptions = {},
): Promise<Activity[]> {
  const perPage = 200
  const activities: Activity[] = []
  let page = 1
  while (true) {
    const url = `${STRAVA_API}/athlete/activities?per_page=${perPage}&page=${page}`
    const res = await fetchWithRetry(url, accessToken, signal)

    const raw = (await res.json()) as StravaSummaryActivity[]
    if (!Array.isArray(raw) || raw.length === 0) break

    const batch: Activity[] = []
    for (const summary of raw) {
      batch.push(summaryToActivity(summary))
    }
    activities.push(...batch)
    onBatch?.(batch)
    onProgress?.(activities.length)

    if (raw.length < perPage) break
    page++
  }
  return activities
}

export async function refreshAccessToken(refreshToken: string): Promise<StravaTokens> {
  const res = await fetch('/api/auth/strava/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!res.ok) throw new Error('refresh_failed')
  return res.json()
}
