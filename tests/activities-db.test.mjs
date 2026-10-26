import assert from 'node:assert/strict'
import test from 'node:test'
import { indexedDB, IDBObjectStore } from 'fake-indexeddb'
import { loadTs } from './load-ts.mjs'

globalThis.indexedDB = indexedDB
const { replaceActivities, loadActivities, clearActivities } = loadTs('src/lib/activities-db.ts')
const activity = (id) => ({
  id,
  type: 'running',
  visibility: 'everyone',
  date: new Date('2026-10-25'),
  distance: 1,
  elevationGain: 0,
  feature: null,
})
const ids = (library) => (library?.activities ?? []).map((row) => row.id).sort()

test('complete sync replaces deleted activities and keeps accounts isolated', async () => {
  await replaceActivities(1, [activity('a'), activity('b')])
  await replaceActivities(2, [activity('other')])
  await replaceActivities(1, [activity('b')])
  assert.deepEqual(ids(await loadActivities(1)), ['b'])
  assert.deepEqual(ids(await loadActivities(2)), ['other'])
  assert.equal(await loadActivities(3), null)
  await replaceActivities(1, [])
  assert.deepEqual((await loadActivities(1)).activities, [])
  assert.deepEqual(ids(await loadActivities(2)), ['other'])
})
test('aborted replacement keeps the last complete library', async (t) => {
  await replaceActivities(1, [activity('before')])
  const original = IDBObjectStore.prototype.put
  t.mock.method(IDBObjectStore.prototype, 'put', function (...args) {
    const request = original.apply(this, args)
    this.transaction.abort()
    return request
  })
  await assert.rejects(replaceActivities(1, [activity('partial')]))
  assert.deepEqual(ids(await loadActivities(1)), ['before'])
})
test('disconnect wipes all account libraries', async () => {
  await clearActivities()
  assert.equal(await loadActivities(1), null)
  assert.equal(await loadActivities(2), null)
})

test('sync metadata is committed atomically with the complete library, including an empty one', async (t) => {
  const stamp = { version: '123:4', syncedAt: Date.now() }
  await replaceActivities(1, [activity('complete')], stamp)
  assert.deepEqual((await loadActivities(1)).sync, stamp)
  const original = IDBObjectStore.prototype.put
  const mocked = t.mock.method(IDBObjectStore.prototype, 'put', function (...args) {
    const request = original.apply(this, args)
    this.transaction.abort()
    return request
  })
  await assert.rejects(replaceActivities(1, [], { ...stamp, version: '123:5' }))
  assert.deepEqual((await loadActivities(1)).sync, stamp)
  assert.deepEqual(ids(await loadActivities(1)), ['complete'])
  mocked.mock.restore()
  await replaceActivities(1, [], stamp)
  assert.deepEqual(await loadActivities(1), { activities: [], sync: stamp })
  await replaceActivities(2, [])
  assert.equal((await loadActivities(2)).sync, null)
})

test('synchronous serialization failure preserves the previous library without unhandled rejection', async () => {
  await replaceActivities(1, [activity('before')])
  await assert.rejects(replaceActivities(1, [{ ...activity('invalid'), date: new Date(NaN) }]))
  assert.deepEqual(ids(await loadActivities(1)), ['before'])
})
