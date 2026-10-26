import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { locateUser } = loadTs('src/lib/geolocation.ts')
const position = { coords: { latitude: 51.5, longitude: -0.12 } }

function browser(t, getCurrentPosition, isSecureContext = true) {
  for (const [key, value] of Object.entries({
    navigator: { geolocation: getCurrentPosition ? { getCurrentPosition } : undefined },
    window: { isSecureContext },
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, value })
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    })
  }
}

test('requests a fresh GPS fix with time for a mobile device to locate', async (t) => {
  browser(t, (success, _error, options) => {
    assert.deepEqual(options, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 })
    success(position)
  })
  assert.deepEqual(await locateUser(), { latitude: 51.5, longitude: -0.12 })
})

for (const code of [2, 3]) {
  test(`falls back to network location after GPS error ${code}`, async (t) => {
    let calls = 0
    browser(t, (success, error, options) => {
      if (++calls === 1) return error({ code })
      assert.deepEqual(options, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 })
      success(position)
    })
    assert.deepEqual(await locateUser(), { latitude: 51.5, longitude: -0.12 })
    assert.equal(calls, 2)
  })
}

test('permission denial explains how to recover without requesting again', async (t) => {
  let calls = 0
  browser(t, (_success, error) => {
    calls++
    error({ code: 1 })
  })
  await assert.rejects(locateUser(), /allow location access in your browser settings/)
  assert.equal(calls, 1)
})

for (const [code, message] of [
  [2, /location unavailable/],
  [3, /timed out/],
]) {
  test(`reports error ${code} when both location providers fail`, async (t) => {
    browser(t, (_success, error) => error({ code }))
    await assert.rejects(locateUser(), message)
  })
}

test('explains why location cannot work over insecure mobile LAN URLs', async (t) => {
  browser(t, () => assert.fail('must not request on HTTP'), false)
  await assert.rejects(locateUser(), /HTTPS/)
})

test('reports unsupported browsers', async (t) => {
  browser(t)
  await assert.rejects(locateUser(), /not supported/)
})

test('a browser that never calls back cannot leave location pending forever', async (t) => {
  const deadlines = []
  const callbacks = []
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    deadlines.push({ callback, delay })
    return 0
  })
  browser(t, (success) => callbacks.push(success))
  const result = locateUser()
  const rejection = assert.rejects(result, /timed out/)
  assert.equal(deadlines[0].delay, 16_000)
  deadlines[0].callback()
  await Promise.resolve()
  assert.equal(deadlines[1].delay, 11_000)
  deadlines[1].callback()
  await rejection
  for (const callback of callbacks) callback(position)
  await assert.rejects(result, /timed out/)
})
