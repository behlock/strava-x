import { NextRequest, NextResponse } from 'next/server'

import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// GET /api/geocode/reverse?lat=...&lng=...
// Proxies a reverse-geocode lookup to Nominatim. The proxy exists so that the
// user's IP is not sent to OpenStreetMap on every cluster lookup, and so that
// we control the rate of outbound calls (Nominatim's policy is ~1 req/sec).

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
const USER_AGENT = 'strava-x/1.0 (https://strava-x.com)'
const FETCH_TIMEOUT_MS = 5000

export async function GET(req: NextRequest) {
  // Per-IP burst cap. Genuine usage is one call per discovered cluster centroid;
  // this limit catches accidental loops without affecting normal flows.
  const rl = rateLimit(clientKey(req, 'geocode'), { windowMs: 60_000, max: 60 })
  if (!rl.ok) return tooManyRequests(rl.retryAfterSeconds ?? 60)

  const { searchParams } = new URL(req.url)
  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'invalid_coordinates' }, { status: 400 })
  }

  // Round to 2 decimals so the upstream request can be cached at the CDN edge
  // and so user-side variance in centroids doesn't fan out to distinct calls.
  const roundedLat = lat.toFixed(2)
  const roundedLng = lng.toFixed(2)

  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('lat', roundedLat)
  url.searchParams.set('lon', roundedLng)
  url.searchParams.set('format', 'json')
  url.searchParams.set('zoom', '10')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const upstream = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!upstream.ok) {
      return NextResponse.json({ error: 'upstream_failed' }, { status: 502 })
    }
    const data = (await upstream.json()) as {
      address?: {
        city?: string
        town?: string
        village?: string
        county?: string
        state?: string
      }
    }
    const a = data.address ?? {}
    const name = a.city || a.town || a.village || a.county || a.state || null
    return NextResponse.json(
      { name },
      {
        // Same-cluster lookups within ~1 day hit the edge cache instead of
        // hitting Nominatim. Stale-while-revalidate keeps results fresh-ish.
        headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
      },
    )
  } catch {
    clearTimeout(timer)
    return NextResponse.json({ error: 'upstream_failed' }, { status: 502 })
  }
}
