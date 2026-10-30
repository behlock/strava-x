import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

function button(connected, refresh) {
  const { ExploreButton } = loadTs('src/components/ui/explore-button.tsx', {
    react: { useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}] },
    'next/navigation': { usePathname: () => '/friend' },
    '@/hooks/use-strava-auth': { useStravaAuth: () => ({ isConnected: connected, getAccessToken: async () => null }) },
    '@/hooks/use-publish': { usePublish: () => ({ refreshCurrentSlug: refresh }) },
  })
  return ExploreButton({ children: 'explore' }).props.children[0]
}

test('connected Explore verifies ownership before navigating and blocks duplicate clicks', async () => {
  const prior = globalThis.window
  const destinations = []
  globalThis.window = { location: { assign: (url) => destinations.push(url) } }
  try {
    let resolve
    const control = button(
      true,
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const pending = control.props.onClick()
    await control.props.onClick()
    assert.deepEqual(destinations, [])
    resolve({ slug: 'my-map' })
    await pending
    assert.equal(destinations.length, 1)
    assert.equal(new URL(destinations[0], 'http://localhost').searchParams.get('own'), 'my-map')
  } finally {
    if (prior === undefined) delete globalThis.window
    else globalThis.window = prior
  }
})

test('ownership failure does not navigate; guests do not require an ownership request', async () => {
  const prior = globalThis.window
  const destinations = []
  globalThis.window = { location: { assign: (url) => destinations.push(url) } }
  try {
    await button(true, async () => undefined).props.onClick()
    assert.deepEqual(destinations, [])
    await button(false, () => assert.fail('Guest ownership lookup')).props.onClick()
    assert.equal(destinations.length, 1)
    assert.equal(new URL(destinations[0], 'http://localhost').searchParams.has('own'), false)
  } finally {
    if (prior === undefined) delete globalThis.window
    else globalThis.window = prior
  }
})
