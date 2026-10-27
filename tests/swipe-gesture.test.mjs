import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { swipeDirection, SWIPE_THRESHOLD } = loadTs('src/lib/swipe-gesture.ts')

test('swipeDirection ignores movement under the threshold', () => {
  assert.equal(swipeDirection(0), null)
  assert.equal(swipeDirection(SWIPE_THRESHOLD), null)
  assert.equal(swipeDirection(-SWIPE_THRESHOLD), null)
  assert.equal(swipeDirection(SWIPE_THRESHOLD - 1), null)
})

test('swipeDirection classifies vertical flicks', () => {
  assert.equal(swipeDirection(SWIPE_THRESHOLD + 1), 'down')
  assert.equal(swipeDirection(-(SWIPE_THRESHOLD + 1)), 'up')
})
