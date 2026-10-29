import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

function renderHeader(connected, ownSlug, updates = [], actions = {}) {
  const { PublicMapView } = loadTs('src/components/public-map-view/public-map-view.tsx', {
    react: { useState: (value) => [value, (next) => updates.push(next)], useEffect() {}, useCallback: (fn) => fn },
    'next/link': { __esModule: true, default: () => null },
    '@/hooks/use-strava-auth': {
      useStravaAuth: () => ({ isConnected: connected, getAccessToken() {}, disconnect() {} }),
    },
    '@/hooks/use-strava-profile': { useStravaProfile: () => null },
    '@/hooks/use-publish': {
      usePublish: () => ({ currentSlug: ownSlug, refreshCurrentSlug: async () => {}, ...actions }),
    },
    '@/hooks/use-common-routes': { useCommonRoutes: () => ({}) },
    '@/hooks/use-map-appearance': { useComparisonAppearance: () => ({}) },
    '@/components/publish': { SharingControls: () => null },
    '@/components/map-view': { MapView: () => null },
    '@/components/ui': { HeaderBar: () => null, Tooltip: () => null, HEADER_LOGO_CLASS: '' },
    '@/components/ui/map-appearance-controls': { CommonRoutesToggle: () => null },
    '@/lib/published-map': { loadPublishedMap() {} },
  })
  const loaded = PublicMapView({ slug: 'friend', blobUrl: '/api/maps/friend' })
  const canvas = loaded.type(loaded.props)
  const view = canvas.type(canvas.props)
  return view.props.header.type(view.props.header.props)
}

test('viewing another map opens the signed-in owner’s sharing controls without navigation', () => {
  const updates = []
  const actions = { publish() {}, unpublish() {}, checkSlug() {}, isPublishing: false }
  const header = renderHeader(true, 'owner', updates, actions)
  const controls = header.props.children
  assert.equal(controls.props.currentSlug, 'owner')
  assert.equal(controls.props.href, undefined)
  assert.equal(controls.props.open, false)
  controls.props.onOpen()
  assert.deepEqual(updates, [true])
  assert.equal(controls.props.isSyncing, false)
  assert.equal(controls.props.publish, actions.publish)
  assert.equal(controls.props.unpublish, actions.unpublish)
  assert.equal(controls.props.checkSlug, actions.checkSlug)
})

test('guests and unpublished accounts never show another account’s map pill', () => {
  assert.equal(renderHeader(false, 'old-owner').props.children, false)
  assert.equal(renderHeader(true, null).props.children, null)
})
