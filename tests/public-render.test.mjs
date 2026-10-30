import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'
const { preparePublicPreview } = loadTs('src/lib/public-render.ts')
const { boundsOf } = loadTs('src/lib/geo-utils.ts')
const route = (n = 100_001) => ({
  id: 'one',
  type: 'running',
  distance: 1,
  elevationGain: 0,
  date: '2026-01-01',
  feature: {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: Array.from({ length: n }, (_, i) => [-0.1 + Math.sin(i) * 0.01, 51.5 + Math.cos(i) * 0.01]),
    },
  },
})
const row = { athlete_id: 1, revision: 'a', snapshot_path: 'private/a', active: true }
function server({
  payload = { version: 1, activities: [route(5)] },
  onRead = () => {},
  readRow = async () => row,
} = {}) {
  let reads = 0
  const { servePublicRender } = loadTs('src/lib/public-render-server.ts', {
    './sharing-db': { findShareBySlug: readRow },
    './local-map': { loadLocalMap: async () => null },
    './sharing-storage': {
      readPrivateSnapshot: async () => {
        reads++
        onRead()
        return { statusCode: 200, stream: new Blob([JSON.stringify(payload)]).stream() }
      },
    },
  })
  return {
    serve: (query = 'view=render') => servePublicRender('owner', new URLSearchParams(query)),
    reads: () => reads,
  }
}
test('small libraries keep full geometry; large previews retain framing extrema and navigation midpoint', () => {
  assert.equal(preparePublicPreview([route(10)]), undefined)
  const original = route(),
    preview = preparePublicPreview([original])[0]
  assert.ok(preview.feature.geometry.coordinates.length < 45)
  assert.deepEqual(boundsOf(preview.feature.geometry.coordinates), boundsOf(original.feature.geometry.coordinates))
  assert.deepEqual(preview.feature.geometry.coordinates[0], original.feature.geometry.coordinates[0])
  assert.deepEqual(
    preview.navigationCoordinate,
    original.feature.geometry.coordinates[Math.floor(original.feature.geometry.coordinates.length / 2)],
  )
  assert.ok(
    preview.feature.geometry.coordinates.includes(
      original.feature.geometry.coordinates[Math.floor(original.feature.geometry.coordinates.length / 2)],
    ),
  )
})
test('immutable storage is reused, but live access is checked on every cache hit', async () => {
  let live = row
  const s = server({ readRow: async () => live })
  assert.equal((await s.serve()).status, 200)
  assert.equal((await s.serve()).status, 200)
  assert.equal(s.reads(), 1)
  live = null
  const revoked = await s.serve()
  assert.equal(revoked.status, 404)
  assert.equal(revoked.headers.get('cache-control'), 'private, no-store, max-age=0')
})
test('revocation or reassignment during render preparation fails closed', async () => {
  for (const replacement of [
    null,
    { ...row, athlete_id: 2 },
    { ...row, revision: 'b' },
    { ...row, snapshot_path: 'private/b' },
  ]) {
    let live = row
    const s = server({
      readRow: async () => live,
      onRead: () => {
        live = replacement
      },
    })
    assert.equal((await s.serve()).status, 404)
  }
})
test('tiles retain route metadata, reject invalid coordinates and cannot serve old revisions', async () => {
  const s = server()
  assert.equal((await s.serve('tile=12/2046/1362&revision=old')).status, 404)
  assert.equal(s.reads(), 0)
  assert.equal((await s.serve('tile=17/0/0')).status, 400)
  assert.equal((await s.serve('tile=1/2/0')).status, 400)
  const response = await s.serve('tile=12/2046/1362&revision=a')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/vnd.mapbox-vector-tile')
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store')
  const { VectorTile } = await import('@mapbox/vector-tile')
  const { default: Pbf } = await import('pbf')
  const tile = new VectorTile(new Pbf(new Uint8Array(await response.arrayBuffer())))
  assert.equal(tile.layers.routes.feature(0).properties.id, 'one')
  assert.equal(tile.layers.routes.feature(0).properties.type, 'running')
})

test('large manifests bind full precision comparisons to the same published revision as the tiles', async () => {
  let live = row
  const activities = [route()]
  const s = server({ payload: { version: 1, activities }, readRow: async () => live })
  const manifest = await (await s.serve()).json()
  assert.ok(manifest.tiles)
  assert.ok(manifest.fullUrl.endsWith('view=full&revision=a'))
  assert.ok(manifest.activities[0].feature.geometry.coordinates.length < 45)
  const query = new URL(manifest.fullUrl, 'http://localhost').search.slice(1)
  live = { ...row, revision: 'b' }
  assert.equal((await s.serve(query)).status, 404)
})

test('static thumbnails are SVG, reuse storage, and are revoked with the map', async () => {
  let live = row
  const s = server({ readRow: async () => live })
  const response = await s.serve('view=thumbnail')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/svg+xml')
  const svg = await response.text()
  assert.match(svg, /<path d="M/)
  assert.doesNotMatch(svg, /NaN|Infinity|<script/)
  assert.equal((await s.serve('view=thumbnail')).status, 200)
  assert.equal(s.reads(), 1)
  live = null
  assert.equal((await s.serve('view=thumbnail')).status, 404)
})

test('thumbnail access is rechecked after storage loading', async () => {
  let live = row
  const s = server({
    readRow: async () => live,
    onRead: () => {
      live = null
    },
  })
  assert.equal((await s.serve('view=thumbnail')).status, 404)
})

test('thumbnail preparation bounds concurrent downloads while cached previews stay available', async () => {
  const releases = []
  const { servePublicRender } = loadTs('src/lib/public-render-server.ts', {
    './sharing-db': { findShareBySlug: async (slug) => ({ ...row, snapshot_path: `private/${slug}` }) },
    './local-map': { loadLocalMap: async () => null },
    './sharing-storage': {
      readPrivateSnapshot: async (path, signal) => {
        assert.ok(signal instanceof AbortSignal)
        if (path !== 'private/cached') await new Promise((resolve) => releases.push(resolve))
        return { statusCode: 200, stream: new Blob([JSON.stringify({ version: 1, activities: [] })]).stream() }
      },
    },
  })
  const query = new URLSearchParams('view=thumbnail')
  assert.equal((await servePublicRender('cached', query)).status, 200)
  const inFlight = Array.from({ length: 4 }, (_, i) => servePublicRender(`pending-${i}`, query))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(releases.length, 4)
  assert.equal((await servePublicRender('overflow', query)).status, 503)
  assert.equal((await servePublicRender('cached', query)).status, 200)
  releases.forEach((release) => release())
  assert.ok((await Promise.all(inFlight)).every((response) => response.status === 200))
})
