import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { loadTs } from './load-ts.mjs'

process.env.STRAVA_CLIENT_SECRET = 'isolated-webhook-secret'
process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID = '123'
const { stravaWebhookToken } = loadTs('src/lib/strava-webhook-config.ts')
function route(recordActivityChange) {
  const handlers = loadTs('src/app/api/strava/webhook/[key]/route.ts', {
    '@/lib/activity-sync-db': { recordActivityChange },
  })
  const context = (req) => ({ params: Promise.resolve({ key: new URL(req.url).pathname.split('/').at(-1) }) })
  return { GET: (req) => handlers.GET(req, context(req)), POST: (req) => handlers.POST(req, context(req)) }
}
const url = () => `https://example.test/api/strava/webhook/${stravaWebhookToken('callback')}`
const event = {
  owner_id: 7,
  object_id: 99,
  subscription_id: 123,
  object_type: 'activity',
  aspect_type: 'create',
  event_time: 1793030000,
  updates: {},
}
const request = (body = event, address = url()) => new Request(address, { method: 'POST', body: JSON.stringify(body) })

test('verification requires the secret callback URL and verification token', async () => {
  const { GET } = route(() => assert.fail('verification must not write data'))
  const address = new URL(url())
  address.searchParams.set('hub.mode', 'subscribe')
  address.searchParams.set('hub.challenge', 'challenge')
  address.searchParams.set('hub.verify_token', stravaWebhookToken('verify'))
  assert.equal((await GET(new Request(address))).status, 200)
  address.pathname = `/api/strava/webhook/${'é'.repeat(64)}`
  assert.equal((await GET(new Request(address))).status, 403)
})

test('untrusted or malformed events cannot invalidate accounts', async () => {
  const { POST } = route(() => assert.fail('invalid event must not write'))
  assert.equal((await POST(request(event, 'https://example.test/api/strava/webhook'))).status, 403)
  for (const changed of [
    { subscription_id: 456 },
    { owner_id: -1 },
    { owner_id: '7' },
    { object_id: 1.1 },
    { event_time: null },
    { updates: 'invalid' },
    { object_type: 'unknown' },
    { aspect_type: 'unknown' },
  ])
    assert.equal((await POST(request({ ...event, ...changed }))).status, 400)
})

test('activity events invalidate only their owner, with a stable key for retries', async () => {
  const changes = []
  const { POST } = route(async (...args) => changes.push(args))
  assert.equal((await POST(request())).status, 200)
  assert.equal((await POST(request())).status, 200)
  assert.deepEqual(changes[0], changes[1])
  assert.equal(changes[0][0], '7')
  assert.match(changes[0][1], /^[a-f0-9]{64}$/)
  assert.equal(
    changes[0][1],
    createHash('sha256')
      .update(JSON.stringify([event.object_type, event.object_id, event.aspect_type, event.event_time, []]))
      .digest('hex'),
  )
  assert.equal(changes[0][2], false)
  await POST(request({ ...event, aspect_type: 'delete' }))
  assert.notEqual(changes[0][1], changes[2][1])
})

test('title-only changes do not trigger a map sync; deauthorization revokes sharing', async () => {
  const changes = []
  const { POST } = route(async (...args) => changes.push(args))
  await POST(request({ ...event, aspect_type: 'update', updates: { title: 'New name' } }))
  assert.equal(changes.length, 0)
  await POST(request({ ...event, aspect_type: 'update', updates: { type: 'Ride' } }))
  assert.equal(changes.length, 1)
  await POST(request({ ...event, object_type: 'athlete', aspect_type: 'update', updates: { authorized: 'false' } }))
  assert.equal(changes[1][2], true)
})

test('storage errors are not acknowledged, allowing Strava to retry', async () => {
  const { POST } = route(async () => {
    throw new Error('database unavailable')
  })
  assert.equal((await POST(request())).status, 503)
})

test('deletions and visibility changes invalidate snapshots, ordinary updates do not', async () => {
  const changes = []
  const { POST } = route(async (...args) => changes.push(args))
  await POST(request({ ...event, aspect_type: 'delete' }))
  await POST(request({ ...event, aspect_type: 'update', updates: { private: 'true' } }))
  await POST(request({ ...event, aspect_type: 'update', updates: { visibility: 'followers_only' } }))
  await POST(request({ ...event, aspect_type: 'update', updates: { type: 'Run' } }))
  await POST(request())
  assert.deepEqual(
    changes.map((args) => args[3]),
    [true, true, true, false, false],
  )
  assert.ok(changes.every((args) => args[2] === false))
})

test('raw int64 webhook IDs target the exact owner and keep adjacent events distinct', async () => {
  const changes = []
  const { POST } = route(async (...args) => changes.push(args))
  const raw = (owner, object, changed = {}) =>
    new Request(url(), {
      method: 'POST',
      body: JSON.stringify({ ...event, ...changed, owner_id: 'OWNER', object_id: 'OBJECT' })
        .replace('"OWNER"', owner)
        .replace('"OBJECT"', object),
    })
  const owner = '9223372036854775807'
  assert.equal((await POST(raw(owner, '9007199254740992'))).status, 200)
  assert.equal((await POST(raw(owner, '9007199254740992'))).status, 200)
  assert.equal((await POST(raw(owner, '9007199254740993'))).status, 200)
  assert.equal((await POST(raw(owner, '9007199254740993', { aspect_type: 'delete' }))).status, 200)
  assert.equal(
    (await POST(raw(owner, owner, { object_type: 'athlete', aspect_type: 'update', updates: { authorized: 'false' } })))
      .status,
    200,
  )
  assert.ok(changes.every((args) => args[0] === owner))
  assert.deepEqual(changes[0], changes[1])
  assert.notEqual(changes[0][1], changes[2][1])
  assert.equal(changes[3][3], true)
  assert.equal(changes[4][2], true)
  const before = changes.length
  for (const id of ['9223372036854775808', '-1', '1.5', '1e3']) assert.equal((await POST(raw(id, '99'))).status, 400)
  assert.equal(changes.length, before)
})

test('webhook bodies remain bounded and malformed JSON is rejected', async () => {
  const { POST } = route(() => assert.fail('must not invalidate any account'))
  for (const body of ['{', ' '.repeat(65 * 1024), 'null', '[]'])
    assert.equal((await POST(new Request(url(), { method: 'POST', body }))).status, 400)
})
