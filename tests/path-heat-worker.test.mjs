import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

test('zoom retains heat until replacement; filters invalidate it and URLs live until replacement/unmount', async (t) => {
  const workers = [],
    revoked = [],
    updates = [],
    effects = []
  let state = null
  const committed = []
  const commit = () => {
    effects.splice(0).forEach(({ fn, deps }, i) => {
      if (committed[i] && deps.every((value, j) => Object.is(value, committed[i].deps[j]))) return
      committed[i]?.cleanup?.()
      committed[i] = { deps, cleanup: fn() }
    })
  }
  const previous = globalThis.Worker
  globalThis.Worker = class {
    constructor() {
      workers.push(this)
    }
    postMessage(request) {
      this.request = request
    }
    terminate() {
      this.terminated = true
    }
  }
  t.after(() => {
    if (previous === undefined) delete globalThis.Worker
    else globalThis.Worker = previous
  })
  t.mock.method(globalThis, 'setTimeout', (fn) => {
    queueMicrotask(fn)
    return 0
  })
  t.mock.method(globalThis, 'clearTimeout', () => {})
  let imageId = 0
  t.mock.method(URL, 'createObjectURL', () => `blob:heat-${++imageId}`)
  t.mock.method(URL, 'revokeObjectURL', (url) => revoked.push(url))
  const { usePathHeat } = loadTs('src/hooks/use-path-heat.ts', {
    react: {
      useState: () => [
        state,
        (value) => {
          state = value
          updates.push(value)
        },
      ],
      useEffect: (fn, deps) => effects.push({ fn, deps }),
    },
  })
  const data = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { id: 'one', type: 'running', dateTs: 1 },
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
      },
    ],
  }
  const tiles = [{ z: 1, x: 0, y: 0 }],
    filter = { types: ['running'], cutoff: null }
  usePathHeat(data, tiles, filter, false, false)
  commit()
  await new Promise(setImmediate)
  assert.equal(workers.length, 0)
  usePathHeat(data, tiles, filter, false, true)
  commit()
  await new Promise(setImmediate)
  const reply = (worker, coordinate) =>
    worker.onmessage({ data: { images: [{ coordinate, blob: new Blob(['image']) }] } })
  reply(workers[0], tiles[0])
  const first = usePathHeat(data, tiles, filter, false, true)
  commit()
  assert.equal(first.images[0].url, 'blob:heat-1')
  assert.equal(workers[0].terminated, true)
  const zoomed = [{ z: 2, x: 1, y: 1 }]
  assert.deepEqual(usePathHeat(data, zoomed, filter, false, true).images, first.images)
  commit()
  assert.deepEqual(revoked, [], 'zoom request must not revoke the visible tiles')
  reply(workers[0], tiles[0])
  assert.equal(updates.length, 1, 'obsolete request ignored')
  await new Promise(setImmediate)
  reply(workers[1], zoomed[0])
  assert.equal(usePathHeat(data, zoomed, filter, false, true).images[0].url, 'blob:heat-2')
  commit()
  assert.deepEqual(revoked, ['blob:heat-1'])
  assert.deepEqual(usePathHeat(data, zoomed, { types: [], cutoff: null }, false, true).images, [])
  commit()
  committed.forEach(({ cleanup }) => cleanup?.())
  assert.deepEqual(revoked, ['blob:heat-1', 'blob:heat-2'])
})
