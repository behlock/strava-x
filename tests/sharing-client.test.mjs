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
  routesVerified: true,
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
