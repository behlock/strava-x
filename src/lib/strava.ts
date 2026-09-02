import type { Activity, ActivityFeature, ActivityType } from '@/models/activity'
import type { LngLat } from '@/models/map'

const STRAVA_API = 'https://www.strava.com/api/v3'
const PER_PAGE = 200
const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 1000

interface StravaSummaryActivity {
  id: number
  name: string
  distance: number // meters
  total_elevation_gain: number // meters
  start_date: string
  sport_type: string
  map?: {
    id?: string
    summary_polyline?: string | null
  }
}

// Map Strava sport_type to our four categories. Unknown types fall through to
// the raw lowercased sport_type — they simply won't match the default filters.
const SPORT_TYPE_MAP: Record<string, ActivityType> = {
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

/** Decodes a Google encoded polyline into `[lng, lat]` pairs (GeoJSON order). */
function decodePolyline(encoded: string): LngLat[] {
  const coords: LngLat[] = []
  let index = 0
  let lat = 0
  let lng = 0

  const readDelta = (): number => {
    let result = 0
    let shift = 0
    let b: number
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }

  while (index < encoded.length) {
    lat += readDelta()
    lng += readDelta()
    coords.push([lng * 1e-5, lat * 1e-5])
  }
  return coords
}

function summaryToActivity(s: StravaSummaryActivity): Activity {
  const polyline = s.map?.summary_polyline
  let feature: ActivityFeature | null = null
  if (polyline) {
    const coordinates = decodePolyline(polyline)
    if (coordinates.length >= 2) {
      feature = { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} }
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

async function fetchWithRetry(url: string, accessToken: string, signal?: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal })
    if (res.status === 401) throw new Error('strava_unauthorized')
    if (res.ok) return res

    const isRateLimited = res.status === 429
    const isServerError = res.status >= 500 && res.status < 600
    if (!isRateLimited && !isServerError) throw new Error(`strava_fetch_failed_${res.status}`)
    if (attempt === MAX_RETRIES) {
      throw new Error(isRateLimited ? 'strava_rate_limited' : `strava_fetch_failed_${res.status}`)
    }

    // Honor Retry-After on 429 when present, otherwise exponential backoff.
    const retryAfter = Number(res.headers.get('Retry-After'))
    const delay =
      isRateLimited && Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : BASE_BACKOFF_MS * 2 ** attempt
    await sleep(delay, signal)
  }
}

interface FetchOptions {
  /** Called with each page of activities as it arrives. */
  onBatch?: (batch: Activity[]) => void
  signal?: AbortSignal
}

/** Pages through every activity on the account. Resolves with the total count fetched. */
export async function fetchAllActivities(accessToken: string, { onBatch, signal }: FetchOptions = {}): Promise<number> {
  let total = 0
  for (let page = 1; ; page++) {
    const url = `${STRAVA_API}/athlete/activities?per_page=${PER_PAGE}&page=${page}`
    const res = await fetchWithRetry(url, accessToken, signal)
    const raw = (await res.json()) as unknown
    if (!Array.isArray(raw) || raw.length === 0) break

    const batch = (raw as StravaSummaryActivity[]).map(summaryToActivity)
    total += batch.length
    onBatch?.(batch)

    if (raw.length < PER_PAGE) break
  }
  return total
}
