import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const activities = [
  {
    id: 'viewer-only-route',
    type: 'cycling',
    date: new Date('2026-10-27'),
    feature: {
      geometry: {
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
    },
  },
]
const data = { type: 'FeatureCollection', features: [] }
const auth = async () => ({ status: 'ok', accessToken: 'token' })
const settle = () => new Promise((resolve) => setImmediate(resolve))

function fixture({ load = async () => activities, compare = async () => data, resolveToken = auth } = {}) {
  const slots = [],
    effects = []
  let cursor = 0
  const react = {
    useCallback: (fn) => fn,
    useState(initial) {
      const i = cursor++
      slots[i] ??= { value: initial }
      return [
        slots[i].value,
        (value) => {
          slots[i].value = typeof value === 'function' ? value(slots[i].value) : value
        },
      ]
    },
    useEffect(fn, deps) {
      const i = cursor++,
        old = slots[i]
      if (!old || deps.some((value, j) => value !== old.deps[j])) {
        effects.push(() => {
          old?.cleanup?.()
          slots[i] = { deps, cleanup: fn() }
        })
      }
    },
  }
  const { useCommonRoutes: renderHook } = loadTs('src/hooks/use-common-routes.ts', {
    react,
    '@/lib/comparison-activities': { loadComparisonActivities: load },
    '@/lib/run-route-comparison': { runRouteComparison: compare },
  })
  return {
    render() {
      cursor = 0
      const state = renderHook(activities, resolveToken)
      effects.splice(0).forEach((fn) => fn())
      return state
    },
    unmount() {
      slots.forEach((slot) => slot.cleanup?.())
    },
  }
}

test('loads only on demand and reuses completed comparison when toggled off and on', async () => {
  let loads = 0
  const ui = fixture({
    load: async () => {
      loads++
      return activities
    },
  })
  let state = ui.render()
  assert.equal(state.state, null)
  assert.equal(loads, 0)
  state.toggle()
  ui.render()
  await settle()
  state = ui.render()
  assert.equal(state.state.status, 'ready')
  assert.equal(state.state.data.features.length, 0)
  assert.equal(state.state.ownRoutes.features.length, 1, 'retain the viewer route even without any overlap')
  assert.deepEqual(state.state.ownRoutes.features[0].properties, {
    id: 'viewer-only-route',
    type: 'cycling',
    dateTs: new Date('2026-10-27').getTime(),
  })
  assert.deepEqual(state.state.ownRoutes.features[0].geometry, activities[0].feature.geometry)
  state.toggle()
  state = ui.render()
  assert.equal(state.state, null)
  state.toggle()
  state = ui.render()
  await settle()
  assert.equal(state.state.status, 'ready')
  assert.equal(loads, 1)
  ui.unmount()
})

test('closing during loading discards late results and allows a fresh attempt', async () => {
  let finish, requestSignal
  const ui = fixture({
    load: (_token, signal) => {
      requestSignal = signal
      return new Promise((resolve) => {
        finish = resolve
      })
    },
  })
  ui.render().toggle()
  ui.render()
  await settle()
  ui.render().toggle()
  ui.render()
  assert.equal(requestSignal.aborted, true)
  finish(activities)
  await settle()
  assert.equal(ui.render().state, null)
  ui.render().toggle()
  ui.render()
  await settle()
  assert.equal(requestSignal.aborted, false)
  finish(activities)
  await settle()
  assert.equal(ui.render().state.status, 'ready')
  ui.unmount()
})

test('unmounting on logout or navigation aborts an active worker comparison', async () => {
  let workerSignal, finish
  const ui = fixture({
    compare: (_public, _own, signal) => {
      workerSignal = signal
      return new Promise((resolve) => {
        finish = resolve
      })
    },
  })
  ui.render().toggle()
  ui.render()
  await settle()
  ui.unmount()
  assert.equal(workerSignal.aborted, true)
  finish(data)
  await settle()
})

test('errors can be retried and transient auth failures do not claim the session expired', async () => {
  let attempts = 0
  const ui = fixture({ resolveToken: async () => (++attempts === 1 ? { status: 'unavailable' } : auth()) })
  ui.render().toggle()
  ui.render()
  await settle()
  let state = ui.render()
  assert.equal(state.state.status, 'error')
  assert.doesNotMatch(state.state.message, /expired/)
  state.retry()
  ui.render()
  await settle()
  state = ui.render()
  assert.equal(state.state.status, 'ready')
  ui.unmount()
})
