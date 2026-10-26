import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server.js'
import { loadTs } from './load-ts.mjs'

const request = (query) => new NextRequest(`http://localhost/api/geocode/reverse?${query}`)
const route = (findUrbanCentre = async () => null) =>
  loadTs('src/app/api/geocode/reverse/route.ts', {
    '@/lib/urban-centres': { findUrbanCentre },
  }).GET

test('invalid coordinates are rejected before any data or upstream request', async (t) => {
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('must not fetch')
  })
  const GET = route(() => {
    throw new Error('must not load data')
  })
  for (const query of ['', 'lat=91&lng=0', 'lat=0&lng=181', 'lat=NaN&lng=0']) {
    assert.equal((await GET(request(query))).status, 400)
  }
})

test('address context and polygon data resolve one stable city, with concurrent requests coalesced', async (t) => {
  let fetches = 0
  t.mock.method(globalThis, 'fetch', async (url) => {
    fetches++
    assert.equal(url.searchParams.get('format'), 'geocodejson')
    assert.equal(url.searchParams.get('lat'), '50.8021')
    return Response.json({ features: [{ properties: { geocoding: { city: 'A municipality' } } }] })
  })
  const GET = route(async () => ({ id: 100, name: 'Example City', names: ['Example City'] }))
  const responses = await Promise.all([GET(request('lat=50.80212&lng=4.339')), GET(request('lat=50.80212&lng=4.339'))])
  assert.equal(fetches, 1)
  for (const response of responses) {
    assert.deepEqual(await response.json(), { city: { id: 'ghsl:100:example city', name: 'Example City' } })
    assert.match(response.headers.get('cache-control'), /s-maxage/)
  }
})

test('upstream failure is not cached as an invented regional city name', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }))
  const response = await route()(request('lat=0&lng=0'))
  assert.equal(response.status, 502)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})
