import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

// Exercise asynchronous hook callbacks with isolated refs and observable setters.
// These tests don't simulate rendering; they test the session/proof guards and
// network payloads independently of React's scheduler.
const react = {
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
  useState: (value) => [value, () => {}],
}
const hook = () => loadTs('src/hooks/use-publish.ts', { react }).usePublish({ getAccessToken: async () => 'token' })
const state = (athleteId = 1, revision = '0', slug = null) => ({ athleteId, revision, slug, fingerprint: null })
const snapshot = () => ({
  athleteId: 1,
  revision: '0',
  expiresAt: Date.now() + 60000,
  proof: 'test-proof',
  fingerprint: 'same',
  activities: [],
})

test('publishing requires a fresh verified snapshot; cached browser activities cannot be substituted', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(state()))
  const client = hook()
  await client.refreshCurrentSlug()
  assert.deepEqual(await client.publish('owner'), { error: 'sync_required' })
})
test('disconnect invalidates a sync that finishes afterwards', async (t) => {
  let requests = 0
  t.mock.method(globalThis, 'fetch', async () => {
    requests++
    return Response.json(state())
  })
  const client = hook(),
    version = client.beginSync(),
    controller = new AbortController()
  await client.refreshCurrentSlug()
  client.forgetCurrentSlug()
  await client.updatePublishedMap(snapshot(), state(1, '0', 'owner'), version, controller.signal)
  assert.equal(requests, 1)
  assert.deepEqual(await client.publish('owner'), { error: 'sync_required' })
})
test('account switching discards the previous account proof', async (t) => {
  const client = hook(),
    controller = new AbortController(),
    version = client.beginSync()
  t.mock.method(globalThis, 'fetch', async () => Response.json(state(2)))
  await client.updatePublishedMap(snapshot(), state(), version, controller.signal)
  await client.refreshCurrentSlug()
  assert.deepEqual(await client.publish('other'), { error: 'sync_required' })
})
test('unchanged automatic update sends only its signed proof, with the captured revision', async (t) => {
  let submitted
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    submitted = JSON.parse(
      await new Response(options.body.stream().pipeThrough(new DecompressionStream('gzip'))).text(),
    )
    return Response.json({ ...state(1, '1', 'owner'), fingerprint: 'same' })
  })
  const client = hook(),
    version = client.beginSync(),
    controller = new AbortController()
  await client.updatePublishedMap(
    snapshot(),
    { ...state(1, '0', 'owner'), fingerprint: 'same' },
    version,
    controller.signal,
  )
  assert.equal(submitted.action, 'update')
  assert.equal(submitted.revision, '0')
  assert.equal(submitted.proof, 'test-proof')
  assert.equal(submitted.activities, undefined)
})

async function requestBody(options) {
  const body =
    options.headers['Content-Type'] === 'application/gzip'
      ? await new Response(options.body.stream().pipeThrough(new DecompressionStream('gzip'))).text()
      : options.body
  return JSON.parse(body)
}

test('stop then re-publish fetches a new signed snapshot without reloading', async (t) => {
  let current = state(1, '0', 'owner')
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = await requestBody(options)
    requests.push({ url, body })
    if (url === '/api/publish/me') return Response.json(current)
    if (url === '/api/activities/sync') {
      return Response.json({
        share: current,
        snapshot: { ...snapshot(), revision: current.revision, proof: 'fresh-proof' },
      })
    }
    assert.equal(body.revision, current.revision)
    current = {
      ...current,
      revision: String(BigInt(current.revision) + 1n),
      slug: body.action === 'stop' ? null : body.slug,
    }
    return Response.json(current)
  })
  const client = hook()
  await client.refreshCurrentSlug()
  assert.deepEqual(await client.unpublish(), { ok: true })
  const result = await client.publish('owner')
  assert.equal(result.slug, 'owner')
  assert.deepEqual(
    requests.map(({ url }) => url),
    ['/api/publish/me', '/api/publish', '/api/activities/sync', '/api/publish'],
  )
  assert.equal(requests[3].body.proof, 'fresh-proof')
  assert.equal(requests[3].body.revision, '1')
  assert.equal(requests[3].body.action, 'create')
})

test('an expired snapshot is refreshed before publishing', async (t) => {
  const client = hook()
  const controller = new AbortController()
  await client.updatePublishedMap({ ...snapshot(), expiresAt: 1 }, state(), client.beginSync(), controller.signal)
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(url)
    if (url === '/api/activities/sync') return Response.json({ share: state(), snapshot: snapshot() })
    assert.equal((await requestBody(options)).proof, 'test-proof')
    return Response.json(state(1, '1', 'owner'))
  })
  assert.equal((await client.publish('owner')).slug, 'owner')
  assert.deepEqual(requests, ['/api/activities/sync', '/api/publish'])
})

test('disconnect during on-demand sync prevents publication and concurrent clicks do not duplicate it', async (t) => {
  const client = hook()
  await client.updatePublishedMap(snapshot(), state(), client.beginSync(), new AbortController().signal)
  // Stop invalidates the existing proof.
  t.mock.method(globalThis, 'fetch', async () => Response.json(state(1, '1')))
  await client.unpublish()
  let release, started
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const ready = new Promise((resolve) => {
    started = resolve
  })
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, '/api/activities/sync')
    started()
    await gate
    return Response.json({ share: state(1, '1'), snapshot: { ...snapshot(), revision: '1' } })
  })
  const pending = client.publish('owner')
  await ready
  assert.deepEqual(await client.publish('owner'), { error: 'busy' })
  client.forgetCurrentSlug()
  release()
  assert.deepEqual(await pending, { error: 'cancelled' })
})

test('a changed revision or account during on-demand sync cannot silently re-publish', async (t) => {
  for (const next of [state(1, '1'), state(2)]) {
    const client = hook()
    t.mock.method(globalThis, 'fetch', async () => Response.json(state()))
    await client.refreshCurrentSlug()
    t.mock.method(globalThis, 'fetch', async (url) => {
      if (url === '/api/publish/me') return Response.json(next)
      assert.equal(url, '/api/activities/sync')
      return Response.json({
        share: next,
        snapshot: { ...snapshot(), athleteId: next.athleteId, revision: next.revision },
      })
    })
    assert.deepEqual(await client.publish('owner'), { error: 'publication_changed' })
  }
})

test('failed on-demand sync can be retried without a reload', async (t) => {
  const client = hook()
  t.mock.method(globalThis, 'fetch', async () => Response.json(state()))
  await client.refreshCurrentSlug()
  let syncs = 0
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === '/api/activities/sync') {
      return ++syncs === 1
        ? Response.json({ error: 'sync_failed' }, { status: 502 })
        : Response.json({ share: state(), snapshot: snapshot() })
    }
    return Response.json(state(1, '1', 'owner'))
  })
  assert.deepEqual(await client.publish('owner'), { error: 'sync_required' })
  assert.equal((await client.publish('owner')).slug, 'owner')
  assert.equal(syncs, 2)
})
