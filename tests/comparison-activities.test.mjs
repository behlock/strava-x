import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const signal = () => new AbortController().signal
const status = { athleteId: 42, version: 'current', webhooksActive: true }
const fresh = { version: 'current', syncedAt: Date.now() }

function loader(loadActivities) {
  return loadTs('src/lib/comparison-activities.ts', { '@/lib/activities-db': { loadActivities } })
    .loadComparisonActivities
}

test('only reads the verified account cache and avoids syncing a fresh library', async (t) => {
  const cached = [{ id: 'own' }]
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url)
    return Response.json(status)
  })
  const load = loader(async (id) => {
    assert.equal(id, 42)
    return { activities: cached, sync: fresh }
  })
  assert.equal(await load('token', signal()), cached)
  assert.deepEqual(requests, ['/api/activities/status'])
})

test('stale caches sync completely and never write to a public map or browser cache', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url)
    return Response.json(
      url.endsWith('status')
        ? status
        : {
            athleteId: 42,
            activities: [{ id: 'new', date: '2026-01-01' }],
          },
    )
  })
  const load = loader(async () => ({ activities: [{ id: 'old' }], sync: { ...fresh, version: 'old' } }))
  const activities = await load('token', signal())
  assert.equal(activities[0].id, 'new')
  assert.ok(activities[0].date instanceof Date)
  assert.deepEqual(requests, ['/api/activities/status', '/api/activities/sync'])
})

test('failed authentication cannot reveal cached activities', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 401 }))
  const load = loader(async () => assert.fail('must not read any cache'))
  await assert.rejects(load('token', signal()), /strava_unauthorized/)
})

test('a failed sync is an error rather than an empty overlap result', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) =>
    url.endsWith('status') ? Response.json(status) : Response.json({ error: 'strava_rate_limited' }, { status: 502 }),
  )
  await assert.rejects(loader(async () => null)('token', signal()), /strava_rate_limited/)
})

test('account changes during sync and cancellation while restoring discard the result', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) =>
    Response.json(url.endsWith('status') ? status : { athleteId: 7, activities: [] }),
  )
  await assert.rejects(loader(async () => null)('token', signal()), /strava_unauthorized/)
  const controller = new AbortController()
  const load = loader(async () => {
    controller.abort()
    return { activities: [], sync: fresh }
  })
  await assert.rejects(load('token', controller.signal), { name: 'AbortError' })
})
