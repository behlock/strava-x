import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'
const { packRoutes } = loadTs('src/lib/packed-routes.ts')
const result = { type: 'FeatureCollection', features: [] }
const library = [
  {
    id: 'a',
    type: 'running',
    date: new Date('2026-01-01'),
    feature: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [0.01, 0],
        ],
      },
    },
  },
]
function setup(t) {
  const workers = []
  class Worker {
    messages = []
    terminated = false
    constructor() {
      workers.push(this)
    }
    postMessage(data, transfer) {
      this.messages.push(structuredClone(data, { transfer }))
    }
    terminate() {
      this.terminated = true
    }
    complete(id) {
      this.onmessage({ data: { id, data: packRoutes(result) } })
    }
  }
  const previous = globalThis.Worker
  globalThis.Worker = Worker
  t.after(() => {
    if (previous) globalThis.Worker = previous
    else delete globalThis.Worker
  })
  const { createRouteComparisonClient } = loadTs('src/lib/run-route-comparison.ts')
  return { client: createRouteComparisonClient(), workers }
}
test('worker receives libraries once, reuses results, and disposes on account/pair changes', async (t) => {
  const { client, workers } = setup(t)
  const signal = new AbortController().signal
  const first = client.run(library, library, signal)
  assert.equal(workers.length, 1)
  assert.ok(workers[0].messages[0].publicRoutes.coordinates.byteLength)
  workers[0].complete(1)
  const data = await first
  assert.equal(await client.run(library, library, signal), data)
  assert.equal(workers[0].messages.length, 1)
  const filtered = client.run(library, library, signal, { types: [], cutoff: null })
  assert.equal(workers[0].messages[1].publicRoutes, undefined)
  workers[0].complete(2)
  await filtered
  const different = client.run([...library], library, signal)
  assert.equal(workers[0].terminated, true)
  assert.equal(workers.length, 2)
  workers[1].complete(3)
  await different
  client.dispose()
  assert.equal(workers[1].terminated, true)
})
test('aborted filter requests coalesce; only the newest pending query reaches the worker', async (t) => {
  const { client, workers } = setup(t)
  const a = new AbortController(),
    b = new AbortController(),
    c = new AbortController()
  const one = client.run(library, library, a.signal)
  const oneRejected = assert.rejects(one)
  a.abort()
  const two = client.run(library, library, b.signal, { types: ['running'], cutoff: 1 })
  const twoRejected = assert.rejects(two)
  b.abort()
  const three = client.run(library, library, c.signal, { types: ['running'], cutoff: 2 })
  assert.equal(workers[0].messages.length, 1)
  workers[0].complete(1)
  assert.equal(workers[0].messages.length, 2)
  assert.equal(workers[0].messages[1].filters.cutoff, 2)
  workers[0].complete(3)
  await three
  await oneRejected
  await twoRejected
  client.dispose()
})
test('disposing during a comparison rejects it and permits a clean restart', async (t) => {
  const { client, workers } = setup(t)
  const request = client.run(library, library, new AbortController().signal)
  const rejected = assert.rejects(request, /cancelled/)
  client.dispose()
  await rejected
  assert.equal(workers[0].terminated, true)
  const retry = client.run(library, library, new AbortController().signal)
  workers[1].complete(2)
  await retry
  client.dispose()
})

test('the worker protocol preserves exact geometry and applies new filters without resending libraries', (t) => {
  const { activitiesToGeoData } = loadTs('src/lib/activities.ts')
  const { unpackRoutes } = loadTs('src/lib/packed-routes.ts')
  const { createRouteComparison } = loadTs('src/lib/common-routes.ts')
  const findCommonRoutes = (other, own) => createRouteComparison(other, own)()
  const previous = globalThis.self
  const messages = []
  globalThis.self = { postMessage: (message, options) => messages.push(structuredClone(message, options)) }
  t.after(() => {
    if (previous) globalThis.self = previous
    else delete globalThis.self
  })
  loadTs('src/lib/common-routes.worker.ts')
  globalThis.self.onmessage({
    data: {
      id: 1,
      publicRoutes: packRoutes(activitiesToGeoData(library)),
      ownRoutes: packRoutes(activitiesToGeoData(library)),
    },
  })
  assert.equal(messages[0].id, 1)
  assert.deepEqual(unpackRoutes(messages[0].data), findCommonRoutes(library, library))
  globalThis.self.onmessage({ data: { id: 2, filters: { types: [], cutoff: null } } })
  assert.deepEqual(unpackRoutes(messages[1].data).features, [])
  globalThis.self.onmessage({ data: { id: 3 } })
  assert.deepEqual(unpackRoutes(messages[2].data), findCommonRoutes(library, library))
})

test('superseded queued requests reject even if the caller has not aborted them', async (t) => {
  const { client, workers } = setup(t)
  const signal = new AbortController().signal
  const first = client.run(library, library, signal)
  const second = client.run(library, library, signal, { types: [], cutoff: 1 })
  const rejected = assert.rejects(second, /cancelled/)
  const third = client.run(library, library, signal, { types: [], cutoff: 2 })
  await rejected
  workers[0].complete(1)
  await first
  assert.equal(workers[0].messages[1].filters.cutoff, 2)
  workers[0].complete(3)
  await third
  client.dispose()
})

test('worker retains its libraries after an oversized comparison so narrower filters can retry', (t) => {
  const { activitiesToGeoData } = loadTs('src/lib/activities.ts')
  const { unpackRoutes } = loadTs('src/lib/packed-routes.ts')
  const { createRouteComparison } = loadTs('src/lib/common-routes.ts')
  const findCommonRoutes = (other, own) => createRouteComparison(other, own)()
  const huge = {
    ...library[0],
    id: 'huge',
    type: 'cycling',
    feature: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: Array.from({ length: 9 }, (_, i) => [i % 2 ? 90 : -90, 0]) },
    },
  }
  const previous = globalThis.self
  const messages = []
  globalThis.self = { postMessage: (message, options) => messages.push(structuredClone(message, options)) }
  t.after(() => {
    if (previous) globalThis.self = previous
    else delete globalThis.self
  })
  loadTs('src/lib/common-routes.worker.ts')
  globalThis.self.onmessage({
    data: {
      id: 1,
      publicRoutes: packRoutes(activitiesToGeoData(library)),
      ownRoutes: packRoutes(activitiesToGeoData([...library, huge])),
    },
  })
  assert.equal(messages[0].error, 'comparison_too_large')
  globalThis.self.onmessage({ data: { id: 2, filters: { types: ['running'], cutoff: null } } })
  assert.deepEqual(unpackRoutes(messages[1].data), findCommonRoutes(library, library))
  globalThis.self.onmessage({ data: { id: 3 } })
  assert.equal(messages[2].error, 'comparison_too_large')
  globalThis.self.onmessage({ data: { id: 4, filters: { types: ['running'], cutoff: null } } })
  assert.deepEqual(unpackRoutes(messages[3].data), findCommonRoutes(library, library))
})
