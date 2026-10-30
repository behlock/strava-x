import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'
const { topRunningCity } = loadTs('src/lib/top-running-city.ts', {
  './urban-centres': {
    findUrbanCentre: async (_lat, lng) => (lng < 0 ? { id: 1, name: 'London' } : { id: 2, name: 'Paris' }),
  },
})
const activity = (type, lng) => ({ type, feature: { geometry: { coordinates: [[lng, 51]] } } })
test('top city counts runs, merges city identities, and ignores other sports', async () => {
  const activities = [
    activity('running', -1),
    activity('running', -2),
    activity('running', 2),
    ...Array.from({ length: 10 }, () => activity('cycling', 2)),
  ]
  assert.equal(await topRunningCity(activities), 'London')
})
test('missing running locations do not invent a city', async () => {
  assert.equal(
    await topRunningCity([activity('cycling', 2), { type: 'running', feature: null }, activity('running', NaN)]),
    null,
  )
})
