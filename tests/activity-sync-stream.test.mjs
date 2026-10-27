import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { readActivitySync } = loadTs('src/lib/activity-sync-stream.ts')
const start = { type: 'start', athleteId: 7 }
const batch = (activities) => ({ type: 'batch', activities })
const complete = (count = 1) => ({
  type: 'complete',
  count,
  result: { athleteId: 7, snapshot: null, share: null, sync: { version: '1', syncedAt: 123 } },
})
const activity = { id: 'one', type: 'running', date: '2026-10-27', name: 'café' }
const encoder = new TextEncoder()
function response(events, fragmented = false) {
  const bytes = encoder.encode(events.map((event) => JSON.stringify(event)).join('\n') + '\n')
  return new Response(
    new ReadableStream({
      start(controller) {
        if (fragmented) for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
        else controller.enqueue(bytes)
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson' } },
  )
}
const signal = () => new AbortController().signal

test('incremental decoder handles split UTF-8 and lines and deduplicates repeated activities', async () => {
  const previews = []
  const updated = { ...activity, type: 'walking' }
  const result = await readActivitySync(
    response([start, batch([activity]), batch([updated]), complete()], true),
    signal(),
    (id, activities) => previews.push({ id, activities }),
  )
  assert.equal(previews.length, 2)
  assert.equal(previews[0].id, 7)
  assert.equal(previews[0].activities[0].name, 'café')
  assert.deepEqual(result.activities, [updated])
})

test('truncation, errors, identity changes, and mismatched counts never return a completed library', async () => {
  for (const events of [
    [start, batch([activity])],
    [start, batch([activity]), { type: 'error', error: 'strava_unauthorized' }],
    [start, { ...start, athleteId: 8 }, batch([activity]), complete()],
    [start, batch([activity]), { ...complete(), result: { ...complete().result, athleteId: 8 } }],
    [start, batch([activity]), complete(2)],
    [start, batch([activity]), complete(), batch([activity])],
  ])
    await assert.rejects(readActivitySync(response(events), signal(), () => {}))
})

test('cancellation stops a blocked stream and cannot commit partial activity data', async () => {
  let cancelled = false
  const controller = new AbortController()
  const body = new ReadableStream({
    start(stream) {
      stream.enqueue(encoder.encode(JSON.stringify(start) + '\n' + JSON.stringify(batch([activity])) + '\n'))
    },
    cancel() {
      cancelled = true
    },
  })
  await assert.rejects(
    readActivitySync(
      new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } }),
      controller.signal,
      () => controller.abort(),
    ),
    { name: 'AbortError' },
  )
  await new Promise(setImmediate)
  assert.equal(cancelled, true)
})

test('a completed empty library replaces history; buffered JSON remains compatible', async () => {
  const empty = await readActivitySync(response([start, complete(0)]), signal(), () => assert.fail())
  assert.deepEqual(empty.activities, [])
  assert.deepEqual(await readActivitySync(Response.json(empty), signal(), () => assert.fail()), empty)
})
