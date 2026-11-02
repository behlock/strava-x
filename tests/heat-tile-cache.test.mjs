import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'
const { HeatTileCache } = loadTs('src/lib/heat-tile-cache.ts')

test('PNG cache bounds bytes and entries and evicts the least recently used image', () => {
  const cache = new HeatTileCache(10, 2)
  cache.set('a', new Uint8Array(4))
  cache.set('b', new Uint8Array(4))
  cache.get('a')
  cache.set('c', new Uint8Array(4))
  assert.equal(cache.get('b'), undefined)
  assert.ok(cache.get('a'))
  cache.set('d', new Uint8Array(8))
  assert.equal(cache.get('a'), undefined)
  assert.equal(cache.get('c'), undefined)
  cache.set('oversize', new Uint8Array(11))
  assert.equal(cache.get('oversize'), undefined)
  assert.ok(cache.get('d'))
  cache.set('d', new Uint8Array(2))
  cache.set('e', new Uint8Array(8))
  assert.ok(cache.get('d'), 'replacement subtracts the old byte count')
})

test('cache reads do not extend the expiry', (t) => {
  let now = 0
  t.mock.method(Date, 'now', () => now)
  const cache = new HeatTileCache(10, 2, 100)
  cache.set('a', new Uint8Array(4))
  now = 99
  assert.ok(cache.get('a'))
  now = 100
  assert.equal(cache.get('a'), undefined)
})
