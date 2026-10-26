import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { isActivityCacheFresh } = loadTs('src/lib/activity-sync.ts')
const now = Date.now()
const status = { athleteId: 7, version: '123:4', webhooksActive: true }
const cached = { version: '123:4', syncedAt: now - 30 * 60_000 }

test('an unchanged library synced half an hour ago needs no download', () => {
  assert.equal(isActivityCacheFresh(cached, status, now), true)
  assert.equal(isActivityCacheFresh(cached, { ...status, webhooksActive: false }, now), true)
})

test('new events, legacy caches, missing metadata, and clock rollback require a sync', () => {
  for (const stamp of [null, undefined, {}, { ...cached, syncedAt: now + 1 }, { ...cached, version: '123:3' }]) {
    assert.equal(isActivityCacheFresh(stamp, status, now), false)
  }
  assert.equal(isActivityCacheFresh(cached, { ...status, version: null }, now), false)
  assert.equal(isActivityCacheFresh(cached, { ...status, version: '124:4' }, now), false)
})

test('reconciliation runs daily with webhooks, hourly without them', () => {
  const old = { ...cached, syncedAt: now - 60 * 60_000 }
  assert.equal(isActivityCacheFresh(old, status, now), true)
  assert.equal(isActivityCacheFresh(old, { ...status, webhooksActive: false }, now), false)
  assert.equal(isActivityCacheFresh({ ...cached, syncedAt: now - 24 * 60 * 60_000 }, status, now), false)
})

test('in-memory restores do not clear or reload a verified account, and disconnect clears it', async () => {
  const writes = []
  let reads = 0
  const first = { activities: [{ id: 'a' }], sync: cached }
  const react = {
    useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, (next) => writes.push(next)],
  }
  const { usePersistedActivities } = loadTs('src/hooks/use-persisted-activities.ts', {
    react,
    '@/lib/activities-db': {
      loadActivities: async () => {
        reads++
        return first
      },
      clearActivities: async () => {},
    },
  })
  const hook = usePersistedActivities()
  const signal = new AbortController().signal
  assert.equal(await hook.restore(7, signal), first)
  writes.length = 0
  assert.equal(await hook.restore(7, signal), first)
  assert.equal(reads, 1)
  assert.deepEqual(writes, [])
  const next = { activities: [], sync: { ...cached, version: '123:5' } }
  hook.setLibrary(7, next)
  assert.equal(await hook.restore(7, signal), next)
  await hook.clear()
  await hook.restore(7, signal)
  assert.equal(reads, 2)
})

test('freshness endpoint verifies the account and cannot trust a submitted athlete ID', async () => {
  let requested
  const api = {
    authenticateAthlete: async () => ({ ok: true, athlete: { athleteId: 7 } }),
    enforceRateLimit: () => null,
    isAccessToken: (value) => value === 'token',
    readJsonBody: (req) => req.json(),
    jsonError: (error, status = 400) => Response.json({ error }, { status }),
  }
  const { POST } = loadTs('src/app/api/activities/status/route.ts', {
    '@/lib/api': api,
    '@/lib/activity-sync-db': {
      getActivityVersion: async (id) => {
        requested = id
        return 'poll:4'
      },
    },
    '@/lib/strava-webhook-config': { webhookSubscriptionId: () => null },
  })
  const response = await POST(
    new Request('https://example.test/api/activities/status', {
      method: 'POST',
      body: JSON.stringify({ accessToken: 'token', athleteId: 99 }),
    }),
  )
  assert.equal(requested, 7)
  assert.deepEqual(await response.json(), { athleteId: 7, version: 'poll:4', webhooksActive: false })
  assert.match(response.headers.get('cache-control'), /no-store/)
})
