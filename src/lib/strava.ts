import type { Activity, ActivityFeature, ActivityType } from '@/models/activity'
import type { LngLat } from '@/models/map'

const STRAVA_API = 'https://www.strava.com/api/v3'
const PER_PAGE = 200
const PAGE_CONCURRENCY = 3
const MAX_PAGES = 250
const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 1000

interface StravaSummaryActivity {
  id: number
  distance: number // meters
  total_elevation_gain: number // meters
  start_date: string
  visibility?: string
  private?: boolean
  sport_type: string
  map?: {
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
      if (index >= encoded.length || shift > 30) throw new Error('strava_invalid_polyline')
      b = encoded.charCodeAt(index++) - 63
      if (b < 0 || b > 63) throw new Error('strava_invalid_polyline')
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
  if (
    !Number.isSafeInteger(s.id) ||
    typeof s.sport_type !== 'string' ||
    !Number.isFinite(Date.parse(s.start_date)) ||
    !Number.isFinite(s.distance) ||
    s.distance < 0 ||
    !Number.isFinite(s.total_elevation_gain) ||
    s.total_elevation_gain < 0
  )
    throw new Error('strava_invalid_response')
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
    visibility:
      s.private === true
        ? 'only_me'
        : s.visibility === 'everyone' || s.visibility === 'followers_only' || s.visibility === 'only_me'
          ? s.visibility
          : 'unknown',
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
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

async function fetchWithRetry(url: string, accessToken: string, signal?: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(15_000)
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
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
        ? Math.min(retryAfter * 1000, 30_000)
        : BASE_BACKOFF_MS * 2 ** attempt
    await sleep(delay, signal)
  }
}

interface FetchOptions {
  /** Called with each page of activities as it arrives. */
  onBatch?: (batch: Activity[]) => void
  signal?: AbortSignal
}

/** Fetch the complete library; never treat a failed page as the end of the list. */
export async function fetchAllActivities(accessToken: string, { onBatch, signal }: FetchOptions = {}): Promise<void> {
  const controller = new AbortController()
  const fetchSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  let page = 1
  let concurrency = 1
  try {
    while (page <= MAX_PAGES) {
      fetchSignal.throwIfAborted()
      const count = Math.min(concurrency, MAX_PAGES - page + 1)
      const requests = Array.from({ length: count }, async (_, offset) => {
        try {
          const url = `${STRAVA_API}/athlete/activities?per_page=${PER_PAGE}&page=${page + offset}`
          const res = await fetchWithRetry(url, accessToken, fetchSignal)
          const raw: unknown = await res.json()
          if (!Array.isArray(raw)) throw new Error('strava_invalid_response')
          return { batch: (raw as StravaSummaryActivity[]).map(summaryToActivity) }
        } catch (error) {
          return { error }
        }
      })
      // Consume in page order; speculative requests past the end are cancelled.
      for (const request of requests) {
        const result = await request
        fetchSignal.throwIfAborted()
        if ('error' in result) throw result.error
        if (result.batch.length === 0) return
        onBatch?.(result.batch)
        // Short pages are not necessarily final. Confirm with an empty page.
        concurrency = result.batch.length < PER_PAGE ? 1 : PAGE_CONCURRENCY
      }
      page += count
    }
    throw new Error('strava_library_too_large')
  } finally {
    controller.abort()
  }
}
