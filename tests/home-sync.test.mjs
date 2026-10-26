import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

function page(cached, share = { athleteId: 7, slug: 'owner', revision: '1', fingerprint: 'same' }) {
  const effects = []
  const writes = []
  const libraries = []
  let stateIndex = 0
  const react = {
    useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }),
    useState: (value) => {
      const index = stateIndex++
      return [value, (next) => writes.push({ index, next })]
    },
    useEffect: (fn) => effects.push(fn),
  }
  const { default: HomePage } = loadTs('src/app/page.tsx', {
    react,
    'next/dynamic': () => () => null,
    '@/lib/config': { config: {} },
    '@/components/map-view': { MapView: () => null },
    '@/components/ui': { Header: () => null },
    '@/lib/activities-db': { replaceActivities: async () => {} },
    '@/hooks/use-persisted-activities': {
      usePersistedActivities: () => ({
        activities: cached?.activities ?? [],
        restore: async (id) => {
          assert.equal(id, 7)
          return cached
        },
        setLibrary: (id, library) => libraries.push({ id, library }),
        clear: async () => {},
      }),
    },
    '@/hooks/use-strava-auth': {
      useStravaAuth: () => ({
        isConnected: true,
        getAccessToken: async () => 'token',
        resolveAccessToken: async () => ({ status: 'ok', accessToken: 'token' }),
        disconnect: () => {},
      }),
    },
    '@/hooks/use-strava-profile': { useStravaProfile: () => null },
    '@/hooks/use-publish': {
      usePublish: () => ({
        currentSlug: share?.slug ?? null,
        refreshCurrentSlug: async () => share,
        beginSync: () => 0,
        updatePublishedMap: async () => {},
        forgetCurrentSlug: () => {},
      }),
    },
  })
  HomePage()
  return {
    effects,
    writes,
    libraries,
    start: async () => {
      effects[1]()
      await new Promise(setImmediate)
    },
  }
}
const stamp = { version: '123:4', syncedAt: Date.now() - 30 * 60_000, fingerprint: 'same' }
const status = { athleteId: 7, version: '123:4', webhooksActive: true }

test('Strict Mode restarts an aborted startup check instead of leaving the page unsynced', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url)
    return Response.json(status)
  })
  const home = page({ activities: [], sync: stamp })
  const cleanup = home.effects[3]()
  home.effects[1]()
  cleanup()
  home.effects[1]()
  await new Promise(setImmediate)
  assert.deepEqual(requests, ['/api/activities/status'])
})

test('reopening with an unchanged recent cache checks status without downloading or showing the sync spinner', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url)
    return Response.json(status)
  })
  const home = page({ activities: [], sync: stamp })
  await home.start()
  assert.deepEqual(requests, ['/api/activities/status'])
  assert.equal(
    home.writes.some(({ index, next }) => index === 0 && next === true),
    false,
  )
  assert.deepEqual(home.libraries, [])
})

test('a changed version downloads a complete library and updates its cached stamp', async (t) => {
  const requests = []
  const sync = { version: '123:5', syncedAt: Date.now() }
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url)
    return Response.json(
      url.endsWith('/status')
        ? { ...status, version: '123:5' }
        : {
            athleteId: 7,
            activities: [],
            share: null,
            snapshot: null,
            sync,
          },
    )
  })
  const home = page({ activities: [], sync: stamp })
  await home.start()
  assert.deepEqual(requests, ['/api/activities/status', '/api/activities/sync'])
  assert.equal(
    home.writes.some(({ index, next }) => index === 0 && next === true),
    true,
  )
  assert.deepEqual(home.libraries, [{ id: 7, library: { activities: [], sync } }])
})

test('failed syncs never advance cached freshness', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) =>
    url.endsWith('/status')
      ? Response.json({ ...status, version: '123:5' })
      : Response.json({ error: 'sync_failed' }, { status: 502 }),
  )
  const home = page({ activities: [], sync: stamp })
  await home.start()
  assert.deepEqual(home.libraries, [])
})

test('a failed public map update is retried even when the personal cache is recent', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url)
    return url.endsWith('/status') ? Response.json(status) : Response.json({ error: 'sync_failed' }, { status: 502 })
  })
  const home = page(
    { activities: [], sync: stamp },
    { athleteId: 7, slug: 'owner', revision: '1', fingerprint: 'older' },
  )
  await home.start()
  assert.deepEqual(requests, ['/api/activities/status', '/api/activities/sync'])
})
