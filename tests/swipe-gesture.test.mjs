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

function gesture() {
  const { useSwipeGesture: createGesture } = loadTs('src/hooks/use-swipe-gesture.ts', {
    react: { useRef: (current) => ({ current }) },
  })
  const calls = []
  return { ...createGesture({ onDown: () => calls.push('down'), onUp: () => calls.push('up') }), calls }
}
const touch = (identifier, clientY, clientX = 0) => ({ identifier, clientX, clientY })
const touchEvent = (touches, changedTouches = touches) => ({
  touches,
  changedTouches,
  target: null,
  currentTarget: null,
})

test('only the initiating finger can move or finish a swipe', () => {
  const original = globalThis.Element
  globalThis.Element = class {}
  try {
    const ui = gesture()
    ui.handlers.onTouchStart(touchEvent([touch(1, 100)]))
    ui.handlers.onTouchStart(touchEvent([touch(1, 100), touch(2, 500)], [touch(2, 500)]))
    ui.handlers.onTouchMove(touchEvent([touch(2, 600), touch(1, 120)]))
    ui.handlers.onTouchEnd(touchEvent([touch(1, 120)], [touch(2, 600)]))
    assert.deepEqual(ui.calls, [])
    ui.handlers.onTouchEnd(touchEvent([], [touch(1, 170)]))
    assert.deepEqual(ui.calls, ['down'])
    assert.equal(ui.guardClick(), false)
    assert.equal(ui.guardClick(), true)
  } finally {
    globalThis.Element = original
  }
})

test('horizontal gestures and cancelled touches never dismiss a sheet', () => {
  const original = globalThis.Element
  globalThis.Element = class {}
  try {
    const ui = gesture()
    ui.handlers.onTouchStart(touchEvent([touch(1, 100)]))
    ui.handlers.onTouchEnd(touchEvent([], [touch(1, 170, 120)]))
    assert.deepEqual(ui.calls, [])
    ui.handlers.onTouchStart(touchEvent([touch(3, 100)]))
    ui.handlers.onTouchMove(touchEvent([touch(3, 200)]))
    ui.handlers.onTouchCancel(touchEvent([], [touch(3, 200)]))
    ui.handlers.onTouchEnd(touchEvent([], [touch(3, 200)]))
    assert.deepEqual(ui.calls, [])
  } finally {
    globalThis.Element = original
  }
})

test('mouse presses preserve child clicks; pointer capture starts only after dragging', () => {
  const original = globalThis.Element
  globalThis.Element = class {}
  try {
    let captures = 0
    const ui = gesture()
    const event = {
      pointerType: 'mouse',
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 0,
      clientY: 100,
      target: null,
      currentTarget: { setPointerCapture: () => captures++, hasPointerCapture: () => captures > 0 },
    }
    ui.handlers.onPointerDown(event)
    assert.equal(captures, 0)
    ui.handlers.onPointerUp(event)
    assert.equal(ui.guardClick(), true)
    ui.handlers.onPointerDown(event)
    ui.handlers.onPointerMove({ ...event, clientY: 170 })
    assert.equal(captures, 1)
    ui.handlers.onPointerUp({ ...event, clientY: 170 })
    assert.deepEqual(ui.calls, ['down'])
    assert.equal(ui.guardClick(), false)
  } finally {
    globalThis.Element = original
  }
})
