import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'
const { validateSlug } = loadTs('src/lib/slug.ts')
const { renderMapThumbnail } = loadTs('src/lib/map-thumbnail.ts')

test('application names cannot be claimed, including normalized variants', () => {
  for (const slug of ['maps', ' MAPS ', 'explore', 'support', 'search', 'profile', 'billing', 'api']) {
    assert.deepEqual(validateSlug(slug), { ok: false, error: 'reserved' })
  }
  assert.deepEqual(validateSlug('walid'), { ok: true, slug: 'walid' })
})

test('empty and malformed routes have a safe static fallback', () => {
  for (const activities of [[], [{ feature: { geometry: { coordinates: [[NaN, Infinity]] } } }]]) {
    const svg = renderMapThumbnail(activities)
    assert.match(svg, /no routes to preview/)
    assert.doesNotMatch(svg, /NaN|Infinity/)
  }
})

test('gallery query lists only published snapshots, with stable activity ranking', async () => {
  let query
  let values
  const { listPublishedMaps } = loadTs('src/lib/sharing-db.ts', {
    '@neondatabase/serverless': {
      neon:
        () =>
        async (strings, ...args) => {
          query = strings.join('?')
          values = args
          return []
        },
    },
  })
  await listPublishedMaps(24, 25)
  assert.match(query, /WHERE active AND slug IS NOT NULL AND snapshot_path IS NOT NULL/)
  assert.match(query, /slug ASC LIMIT/)
  assert.deepEqual(values, [false, false, false, true, false, false, 25, 24])
  assert.doesNotMatch(query, /SELECT \*/)
})

test('excess thumbnail requests stop before database or snapshot work', async () => {
  const limited = new Response(null, { status: 429 })
  const { GET } = loadTs('src/app/api/maps/[slug]/route.ts', {
    '@/lib/api': { enforceRateLimit: () => limited },
    '@/lib/sharing-db': { findShareBySlug: () => assert.fail('rate-limited request must not query storage metadata') },
    '@/lib/sharing-storage': { readPrivateSnapshot: () => assert.fail('rate-limited request must not read snapshots') },
    '@/lib/local-map': { loadLocalMap: () => assert.fail('rate-limited request must not load fixtures') },
  })
  const response = await GET(
    { nextUrl: new URL('http://localhost/api/maps/owner?view=thumbnail') },
    { params: Promise.resolve({ slug: 'owner' }) },
  )
  assert.equal(response.status, 429)
})
