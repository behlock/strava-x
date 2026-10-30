import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

test('ownership display survives remounts, follows revisions, and rejects replies after logout', () => {
  const previousWindow = globalThis.window
  globalThis.window = {}
  try {
    const store = loadTs('src/lib/published-owner.ts')
    let notifications = 0
    const unsubscribe = store.subscribePublishedOwner(() => notifications++)
    const epoch = store.getPublishedOwnerEpoch()
    store.rememberPublishedOwner({ athleteId: 1, slug: 'my-map', revision: '2' }, epoch)
    assert.equal(store.getPublishedOwnerSlug(), 'my-map')
    store.rememberPublishedOwner({ athleteId: 1, slug: 'old-name', revision: '1' }, epoch)
    assert.equal(store.getPublishedOwnerSlug(), 'my-map')
    store.rememberPublishedOwner({ athleteId: 1, slug: 'new-name', revision: '3' }, epoch)
    assert.equal(store.getPublishedOwnerSlug(), 'new-name')
    store.rememberPublishedOwner({ athleteId: 1, slug: null, revision: '4' }, epoch)
    assert.equal(store.getPublishedOwnerSlug(), null)
    store.clearPublishedOwner()
    store.rememberPublishedOwner({ athleteId: 1, slug: 'late-reply', revision: '5' }, epoch)
    assert.equal(store.getPublishedOwnerSlug(), null)
    assert.equal(notifications, 4)
    unsubscribe()
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})
