import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { fetchAllActivities } = loadTs('src/lib/strava.ts')
const activity = (id) => ({
  id,
  sport_type: 'Run',
  start_date: '2026-10-25T09:00:00Z',
  distance: 1000,
  total_elevation_gain: 20,
})
const fullPage = (page) => Array.from({ length: 200 }, (_, i) => activity((page - 1) * 200 + i + 1))
const pageNumber = (url) => Number(new URL(url).searchParams.get('page'))

test('short pages do not truncate the library; an empty page ends the sync', async (t) => {
  const pages = []
  const ids = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    const page = pageNumber(url)
    pages.push(page)
    return Response.json(page < 3 ? [activity(page)] : [])
  })
  await fetchAllActivities('token', { onBatch: (batch) => ids.push(...batch.map((a) => a.id)) })
  assert.deepEqual(ids, ['strava-1', 'strava-2'])
  assert.deepEqual(pages, [1, 2, 3])
})

test('large libraries fetch three pages concurrently and deliver them in order', async (t) => {
  const started = Promise.withResolvers()
  const pending = new Map()
  const batches = []
  let active = 0
  let peak = 0
  t.mock.method(globalThis, 'fetch', async (url) => {
    const page = pageNumber(url)
    if (page === 1) return Response.json(fullPage(1))
    active++
    peak = Math.max(peak, active)
    const deferred = Promise.withResolvers()
    pending.set(page, deferred)
    if (pending.size === 3) started.resolve()
    try {
      return await deferred.promise
    } finally {
      active--
    }
  })
  const sync = fetchAllActivities('token', { onBatch: (batch) => batches.push(batch[0].id) })
  await started.promise
  assert.equal(peak, 3)
  pending.get(4).resolve(Response.json([]))
  pending.get(3).resolve(Response.json([activity(401)]))
  assert.deepEqual(batches, ['strava-1'])
  pending.get(2).resolve(Response.json(fullPage(2)))
  await sync
  assert.deepEqual(batches, ['strava-1', 'strava-201', 'strava-401'])
  assert.deepEqual([...pending.keys()], [2, 3, 4])
})

test('an empty library needs only one request', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json([]))
  await fetchAllActivities('token', { onBatch: () => assert.fail('empty library has no batches') })
  assert.equal(fetch.mock.callCount(), 1)
})

test('requests beyond the empty page cannot fail an otherwise complete sync', async (t) => {
  const signals = []
  t.mock.method(globalThis, 'fetch', async (url, { signal }) => {
    signals.push(signal)
    const page = pageNumber(url)
    if (page === 1) return Response.json(fullPage(1))
    if (page === 2) return Response.json([])
    if (page === 3) return new Response(null, { status: 401 })
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  })
  let count = 0
  await fetchAllActivities('token', { onBatch: (batch) => (count += batch.length) })
  assert.equal(count, 200)
  assert.ok(signals.every((signal) => signal.aborted))
})

test('a required page failure rejects the sync and cancels remaining requests', async (t) => {
  const signals = []
  t.mock.method(globalThis, 'fetch', async (url, { signal }) => {
    signals.push(signal)
    if (pageNumber(url) === 1) return Response.json(fullPage(1))
    if (pageNumber(url) === 2) return Response.json({ error: 'invalid response' })
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  })
  await assert.rejects(fetchAllActivities('token'), /strava_invalid_response/)
  assert.ok(signals.every((signal) => signal.aborted))
})

test('disconnect cancels all in-flight pages', async (t) => {
  const controller = new AbortController()
  const started = Promise.withResolvers()
  const signals = []
  const batches = []
  t.mock.method(globalThis, 'fetch', async (url, { signal }) => {
    if (pageNumber(url) === 1) return Response.json(fullPage(1))
    signals.push(signal)
    if (signals.length === 3) started.resolve()
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  })
  const sync = fetchAllActivities('token', { signal: controller.signal, onBatch: (batch) => batches.push(batch) })
  const rejected = assert.rejects(sync, { name: 'AbortError' })
  await started.promise
  controller.abort()
  await rejected
  assert.ok(signals.every((signal) => signal.aborted))
  assert.equal(batches.length, 1)
})

test('rate limiting retries the same page before continuing', async (t) => {
  const pages = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    pages.push(pageNumber(url))
    return pages.length === 1
      ? new Response(null, { status: 429, headers: { 'Retry-After': '0.001' } })
      : Response.json([])
  })
  await fetchAllActivities('token')
  assert.deepEqual(pages, [1, 1])
})
