import { type NextRequest, NextResponse } from 'next/server'

import { enforceRateLimit, jsonError } from '@/lib/api'
import { SITE_URL } from '@/lib/site'
import { resolveCity, type GeocodeAddress, type ResolvedCity } from '@/lib/city-names'
import { findUrbanCentre } from '@/lib/urban-centres'

export const runtime = 'nodejs'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
const USER_AGENT = `strava-x/1.0 (${SITE_URL})`
const FETCH_TIMEOUT_MS = 5000

type LookupResult = { ok: true; city: ResolvedCity | null } | { ok: false }

interface GeocodeJson {
  features?: Array<{ properties?: { geocoding?: GeocodeAddress } }>
}

// Dedupes concurrent upstream calls for the same coordinate so a burst of
// users hitting a cache-cold centroid only fires one Nominatim request.
const inFlightLookups = new Map<string, Promise<LookupResult>>()

async function fetchUpstream(lat: string, lng: string): Promise<LookupResult> {
  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('lat', lat)
  url.searchParams.set('lon', lng)
  // Address-level context includes the parent settlement, not just an administrative district.
  url.searchParams.set('format', 'geocodejson')
  url.searchParams.set('zoom', '18')
  url.searchParams.set('accept-language', 'en')
  url.searchParams.set('layer', 'address')

  try {
    const [urban, upstream] = await Promise.all([
      findUrbanCentre(Number(lat), Number(lng)),
      fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }),
    ])
    if (!upstream.ok) return { ok: false }
    const data = (await upstream.json()) as GeocodeJson
    return { ok: true, city: resolveCity(data.features?.[0]?.properties?.geocoding, urban) }
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
  if (!searchParams.get('lat')?.trim() || !searchParams.get('lng')?.trim()) return jsonError('invalid_coordinates')
  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return jsonError('invalid_coordinates')
  }

  // Keep enough precision to avoid moving the lookup across an urban boundary.
  const result = await lookupName(lat.toFixed(4), lng.toFixed(4))
  if (!result.ok) return jsonError('upstream_failed', 502)

  return NextResponse.json(
    { city: result.city },
    {
      // Same-cluster lookups within ~1 day hit the edge cache instead of
      // Nominatim. Stale-while-revalidate keeps results fresh-ish.
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    },
  )
}
