import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

test('TTL cache enforces LRU capacity without extending token lifetime on reads', (t) => {
  let now = 0
  t.mock.method(Date, 'now', () => now)
  const { TtlCache } = loadTs('src/lib/ttl-cache.ts')
  const cache = new TtlCache(2, 100)
  cache.set('a', 1)
  cache.set('b', 2)
  now = 50
  assert.equal(cache.get('a'), 1)
  cache.set('c', 3)
  assert.equal(cache.get('b'), undefined)
  now = 100
  assert.equal(cache.get('a'), undefined)
  assert.equal(cache.get('c'), 3)
  cache.delete('c')
  assert.equal(cache.get('c'), undefined)
})
test('rate limits retain each bucket expiry and stay bounded under key churn', (t) => {
  let now = 0
  t.mock.method(Date, 'now', () => now)
  const { rateLimit } = loadTs('src/lib/rate-limit.ts')
  const long = { windowMs: 60_000, max: 1 }
  rateLimit('old', long)
  now = 2_000
  assert.deepEqual(rateLimit('old', long), { ok: false, retryAfterSeconds: 58 })
  for (let i = 0; i < 5001; i++) rateLimit(`key-${i}`, { windowMs: 1000, max: 1 })
  assert.deepEqual(rateLimit('old', long), { ok: true })
  now = 3_000
  assert.deepEqual(rateLimit('key-5000', { windowMs: 1000, max: 1 }), { ok: true })
  assert.equal(rateLimit('old', long).ok, false)
})
test('JSON token endpoints bound chunked bodies and reject malformed input', async () => {
  const { readJsonBody } = loadTs('src/lib/api.ts')
  const request = (body) => new Request('http://localhost', { method: 'POST', body })
  assert.deepEqual(await readJsonBody(request('{"ok":true}')), { ok: true })
  assert.equal(await readJsonBody(request('oops')), null)
  assert.equal(await readJsonBody(request(' '.repeat(65 * 1024))), null)
})

test('bounded request reads cancel oversized streams without trusting Content-Length', async () => {
  const { readBoundedBody } = loadTs('src/lib/api.ts')
  let cancelled = false
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(4))
      controller.enqueue(new Uint8Array(4))
    },
    cancel() {
      cancelled = true
    },
  })
  const request = new Request('http://localhost', { method: 'POST', body, duplex: 'half' })
  assert.equal(await readBoundedBody(request, 6), null)
  assert.equal(cancelled, true)
  const exact = new Request('http://localhost', { method: 'POST', body: '1234' })
  assert.equal((await readBoundedBody(exact, 4)).toString(), '1234')
})
