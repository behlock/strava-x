import { type NextRequest, NextResponse } from 'next/server'

import { enforceRateLimit, jsonError } from '@/lib/api'
import { SITE_URL } from '@/lib/site'

export const runtime = 'nodejs'

// GET /api/geocode/reverse?lat=...&lng=...
// Proxies a reverse-geocode lookup to Nominatim. The proxy exists so that the
// user's IP is not sent to OpenStreetMap on every cluster lookup, and so that
// we control the rate of outbound calls (Nominatim's policy is ~1 req/sec).

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
const USER_AGENT = `strava-x/1.0 (${SITE_URL})`
const FETCH_TIMEOUT_MS = 5000

type LookupResult = { ok: true; name: string | null } | { ok: false }

// Dedupes concurrent upstream calls for the same coordinate so a burst of
// users hitting a cache-cold centroid only fires one Nominatim request.
const inFlightLookups = new Map<string, Promise<LookupResult>>()

async function fetchUpstream(lat: string, lng: string): Promise<LookupResult> {
  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('lat', lat)
  url.searchParams.set('lon', lng)
  url.searchParams.set('format', 'json')
  url.searchParams.set('zoom', '10')

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!upstream.ok) return { ok: false }
    const data = (await upstream.json()) as {
      address?: { city?: string; town?: string; village?: string; county?: string; state?: string }
    }
    const a = data.address ?? {}
    return { ok: true, name: a.city || a.town || a.village || a.county || a.state || null }
  } catch {
    return { ok: false }
  }
}

function lookupName(lat: string, lng: string): Promise<LookupResult> {
  const key = `${lat},${lng}`
  const existing = inFlightLookups.get(key)
  if (existing) return existing
  const pending = fetchUpstream(lat, lng).finally(() => {
    if (inFlightLookups.get(key) === pending) inFlightLookups.delete(key)
  })
  inFlightLookups.set(key, pending)
  return pending
}

export async function GET(req: NextRequest) {
  // Genuine usage is one call per discovered cluster centroid; this catches
  // accidental loops without affecting normal flows.
  const limited = enforceRateLimit(req, 'geocode', { windowMs: 60_000, max: 60 })
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return jsonError('invalid_coordinates')
  }

  // Round to 2 decimals so the upstream request can be cached at the CDN edge
  // and so user-side variance in centroids doesn't fan out to distinct calls.
  const result = await lookupName(lat.toFixed(2), lng.toFixed(2))
  if (!result.ok) return jsonError('upstream_failed', 502)

  return NextResponse.json(
    { name: result.name },
    {
      // Same-cluster lookups within ~1 day hit the edge cache instead of
      // Nominatim. Stale-while-revalidate keeps results fresh-ish.
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    },
  )
}
