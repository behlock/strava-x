import assert from 'node:assert/strict'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { loadTs } from './load-ts.mjs'

process.env.STRAVA_CLIENT_SECRET = 'isolated-test-secret'
const { digest } = loadTs('src/lib/sharing-proof.ts')
const api = {
  authenticateAthlete: async () => ({ ok: true, athlete: { athleteId: 7 } }),
  enforceRateLimit: () => null,
  isAccessToken: (t) => typeof t === 'string',
  readJsonBody: (req) => req.json(),
  jsonError: (error, status = 400) => Response.json({ error }, { status }),
}
const row = {
  athlete_id: 7,
  active: true,
  slug: 'owner',
  revision: '4',
  fingerprint: 'old',
  snapshot_path: 'private/old',
}
const item = (id, visibility = 'everyone') => ({
  id,
  sport_type: 'Run',
  start_date: '2026-10-25T09:43:00Z',
  distance: 1000,
  total_elevation_gain: 20,
  visibility,
  map: { summary_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
})
const request = () =>
  new Request('http://localhost/api/activities/sync', {
    method: 'POST',
    body: JSON.stringify({
      accessToken: 'token',
    }),
  })
function syncRoute(getActivityVersion = async () => null) {
  return loadTs('src/app/api/activities/sync/route.ts', {
    '@/lib/api': api,
    '@/lib/activity-sync-db': { getActivityVersion },
    '@/lib/sharing-db': {
      ensureShare: async () => ({ ...row }),
      shareState: (r) => ({ athleteId: r.athlete_id, slug: r.slug, revision: r.revision, fingerprint: r.fingerprint }),
    },
  }).POST
}

test('sync records the change version before downloading, so concurrent webhook changes remain pending', async (t) => {
  let version = '123:4'
  t.mock.method(globalThis, 'fetch', async (url) => {
    version = '123:5'
    return Response.json(new URL(url).searchParams.get('page') === '1' ? [item(1)] : [])
  })
  const result = await decoded(await syncRoute(async () => version)(request()))
  assert.equal(result.sync.version, '123:4')
  assert.ok(result.sync.syncedAt <= Date.now())
  assert.equal(result.sync.fingerprint, result.snapshot.fingerprint)
  assert.equal(version, '123:5')
})
async function decoded(response) {
  return JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString())
}

test('sync signs every imported route without a scope proof; captures revision before network I/O', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (new URL(url).searchParams.get('page') !== '1') return Response.json([])
    row.revision = '5'
    return Response.json([
      item(1),
      item(2, 'followers_only'),
      item(3, 'only_me'),
      { ...item(4), visibility: undefined, private: false },
    ])
  })
  const result = await decoded(await syncRoute()(request()))
  assert.equal(result.share.revision, '4')
  assert.equal(result.activities.length, 4)
  assert.equal(result.activities[1].visibility, 'followers_only')
  assert.equal(result.snapshot.activities.length, 4)
  assert.equal(
    result.snapshot.activities.some((a) => a.id === 'strava-2'),
    true,
  )
  assert.equal(result.snapshot.activities[0].date, '2026-10-25')
  assert.ok(result.snapshot.activities.every((activity) => activity.feature.geometry.coordinates.length > 1))
  assert.equal(row.revision, '5')
})
test('failure on a later page returns no partial snapshot or publishable proof', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () =>
    ++calls === 1
      ? Response.json(Array.from({ length: 200 }, (_, i) => item(i + 1)))
      : new Response(null, { status: 401 }),
  )
  const response = await syncRoute()(request())
  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { error: 'strava_unauthorized' })
  assert.equal(calls, 4)
})
test('successful empty sync yields a valid empty snapshot instead of retaining old routes', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json([]))
  const result = await decoded(await syncRoute()(request()))
  assert.deepEqual(result.activities, [])
  assert.deepEqual(result.snapshot.activities, [])
  assert.equal(result.snapshot.fingerprint, digest('[]'))
})
test('public delivery never reads legacy blobs and stops a response revoked during storage I/O', async () => {
  let live = { ...row },
    reads = 0
  const { GET } = loadTs('src/app/api/maps/[slug]/route.ts', {
    '@/lib/sharing-db': { findShareBySlug: async () => live },
    '@/lib/sharing-storage': {
      readPrivateSnapshot: async () => {
        reads++
        live = null
        return { statusCode: 200, stream: new Blob(['private snapshot']).stream() }
      },
    },
  })
  let response = await GET(null, { params: Promise.resolve({ slug: 'owner' }) })
  assert.equal(response.status, 404)
  assert.match(response.headers.get('cache-control'), /no-store/)
  assert.equal(reads, 1)
  live = { ...row, snapshot_path: null }
  response = await GET(null, { params: Promise.resolve({ slug: 'owner' }) })
  assert.equal(response.status, 404)
  assert.equal(reads, 1)
})
test('slug reassignment cannot serve the previous owner snapshot with a matching revision', async () => {
  for (const replacement of [
    { ...row, athlete_id: row.athlete_id + 1 },
    { ...row, snapshot_path: 'private/replacement' },
  ]) {
    let live = { ...row }
    let cancelled = false
    const { GET } = loadTs('src/app/api/maps/[slug]/route.ts', {
      '@/lib/sharing-db': { findShareBySlug: async () => live },
      '@/lib/sharing-storage': {
        readPrivateSnapshot: async () => {
          live = replacement
          return {
            statusCode: 200,
            stream: new ReadableStream({
              cancel: () => {
                cancelled = true
              },
            }),
          }
        },
      },
    })
    const response = await GET(null, { params: Promise.resolve({ slug: 'owner' }) })
    assert.equal(response.status, 404)
    assert.equal(await response.text(), '')
    assert.equal(cancelled, true)
  }
})
test('live public response streams through the API with no browser or CDN caching', async () => {
  const { GET } = loadTs('src/app/api/maps/[slug]/route.ts', {
    '@/lib/sharing-db': { findShareBySlug: async () => row },
    '@/lib/sharing-storage': {
      readPrivateSnapshot: async () => ({ statusCode: 200, stream: new Blob(['snapshot']).stream() }),
    },
  })
  const response = await GET(null, { params: Promise.resolve({ slug: 'owner' }) })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'snapshot')
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store')
})

test('public storage failures fail closed with an uncached service error', async () => {
  const { GET } = loadTs('src/app/api/maps/[slug]/route.ts', {
    '@/lib/sharing-db': { findShareBySlug: async () => row },
    '@/lib/sharing-storage': {
      readPrivateSnapshot: async () => {
        throw new Error('storage unavailable')
      },
    },
  })
  const response = await GET(null, { params: Promise.resolve({ slug: 'owner' }) })
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store')
})

test('missing sharing tables do not block personal sync or issue a publishable proof', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) =>
    Response.json(new URL(url).searchParams.get('page') === '1' ? [item(1), item(2, 'only_me')] : []),
  )
  const { POST } = loadTs('src/app/api/activities/sync/route.ts', {
    '@/lib/api': api,
    '@/lib/activity-sync-db': { getActivityVersion: async () => null },
    '@/lib/sharing-db': {
      ensureShare: async () => {
        throw Object.assign(new Error('relation map_shares does not exist'), { code: '42P01' })
      },
    },
  })
  const response = await POST(request())
  assert.equal(response.status, 200)
  const result = await decoded(response)
  assert.equal(result.athleteId, 7)
  assert.equal(result.activities.length, 2)
  assert.equal(result.activities[1].visibility, 'only_me')
  assert.equal(result.share, null)
  assert.equal(result.snapshot, null)
  assert.match(response.headers.get('cache-control'), /no-store/)
})
test('failed personal sync without a sharing database still returns no partial library', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () =>
    ++calls === 1
      ? Response.json(Array.from({ length: 200 }, (_, i) => item(i + 1)))
      : new Response(null, { status: 401 }),
  )
  const { POST } = loadTs('src/app/api/activities/sync/route.ts', {
    '@/lib/api': api,
    '@/lib/activity-sync-db': { getActivityVersion: async () => null },
    '@/lib/sharing-db': {
      ensureShare: async () => {
        throw new Error('database unavailable')
      },
    },
  })
  const response = await POST(request())
  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { error: 'strava_unauthorized' })
})
test('sharing status returns a controlled service error when the database is unavailable', async () => {
  const { POST } = loadTs('src/app/api/publish/me/route.ts', {
    '@/lib/api': api,
    '@/lib/sharing-db': {
      ensureShare: async () => {
        throw new Error('database unavailable')
      },
    },
  })
  const response = await POST(request())
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'sharing_unavailable' })
})

test('sharing preparation failures preserve the complete personal library without issuing a proof', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) =>
    Response.json(new URL(url).searchParams.get('page') === '1' ? [item(1)] : []),
  )
  const actual = loadTs('src/lib/share-snapshot.ts')
  for (const canonicalSnapshot of [
    () => 'x'.repeat(25 * 1024 * 1024 + 1),
    () => {
      throw new Error('invalid_activities')
    },
  ]) {
    const { POST } = loadTs('src/app/api/activities/sync/route.ts', {
      '@/lib/api': api,
      '@/lib/activity-sync-db': { getActivityVersion: async () => null },
      '@/lib/sharing-db': {
        ensureShare: async () => row,
        shareState: (r) => ({ athleteId: r.athlete_id, slug: r.slug, revision: r.revision }),
      },
      '@/lib/share-snapshot': { ...actual, canonicalSnapshot },
    })
    const response = await POST(request())
    assert.equal(response.status, 200)
    const result = await decoded(response)
    assert.equal(result.activities.length, 1)
    assert.equal(result.activities[0].id, 'strava-1')
    assert.equal(result.snapshot, null)
  }
})

test('a failed final ownership check cancels the private stream and returns no snapshot', async () => {
  let checks = 0,
    cancelled = false
  const { GET } = loadTs('src/app/api/maps/[slug]/route.ts', {
    '@/lib/sharing-db': {
      findShareBySlug: async () => {
        if (++checks > 1) throw new Error('database unavailable')
        return row
      },
    },
    '@/lib/sharing-storage': {
      readPrivateSnapshot: async () => ({
        statusCode: 200,
        stream: new ReadableStream({
          cancel: () => {
            cancelled = true
          },
        }),
      }),
    },
  })
  const response = await GET(null, { params: Promise.resolve({ slug: 'owner' }) })
  assert.equal(response.status, 503)
  assert.equal(await response.text(), '')
  assert.equal(cancelled, true)
})

test('link availability fails closed with a controlled, uncached database error', async () => {
  const { POST } = loadTs('src/app/api/publish/check/route.ts', {
    '@/lib/api': api,
    '@/lib/sharing-db': {
      findShareBySlug: async () => {
        throw new Error('database unavailable')
      },
    },
  })
  const response = await POST(
    new Request('http://localhost/api/publish/check', {
      method: 'POST',
      body: JSON.stringify({ slug: 'owner' }),
    }),
  )
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { available: false, reason: 'sharing_unavailable' })
})
