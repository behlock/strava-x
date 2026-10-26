import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

process.env.STRAVA_CLIENT_SECRET = 'isolated-test-secret'
const { mutateShare } = loadTs('src/lib/sharing-service.ts')
const { digest, signProof, hasSafeRouteGrant, safeRouteScope } = loadTs('src/lib/sharing-proof.ts')
const { publicActivities, canonicalSnapshot } = loadTs('src/lib/share-snapshot.ts')
const activity = (id = '1', visibility = 'everyone') => ({
  id,
  type: 'running',
  visibility,
  date: new Date('2026-10-25T09:43:00Z'),
  distance: 10,
  elevationGain: 20,
  feature: {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [1, 2],
        [3, 4],
      ],
    },
    properties: { secret: 'not public' },
  },
})
const payload = (items = [activity()]) => publicActivities(items, true)
function signed(activities, revision = '0', athleteId = 1, expiresAt = Date.now() + 60_000) {
  return signProof(
    'snapshot',
    { athleteId, revision, policy: 1, fingerprint: digest(canonicalSnapshot(activities)) },
    expiresAt,
  )
}
function fixture() {
  let row = {
    athlete_id: 1,
    slug: null,
    active: false,
    revision: '0',
    athlete_display_name: null,
    snapshot_path: null,
    fingerprint: null,
    activity_count: 0,
    size_bytes: 0,
    updated_at: null,
  }
  const uploads = new Map(),
    discards = []
  const store = {
    read: async () => ({ ...row }),
    commit: async (expected, next) => {
      if (expected.revision !== row.revision) return null
      row = {
        ...row,
        slug: next.slug,
        active: next.active,
        revision: String(BigInt(row.revision) + 1n),
        snapshot_path: next.snapshotPath,
        fingerprint: next.fingerprint,
        activity_count: next.activityCount,
        size_bytes: next.sizeBytes,
        updated_at: next.updatedAt,
      }
      return { ...row }
    },
    upload: async (_id, body) => {
      const path = `private/${uploads.size}`
      uploads.set(path, body)
      return path
    },
    discard: async (path) => {
      discards.push(path)
    },
  }
  return {
    store,
    uploads,
    discards,
    get row() {
      return row
    },
  }
}
const create = (f, activities = payload()) =>
  mutateShare(f.store, {
    athleteId: 1,
    displayName: 'Owner',
    action: 'create',
    slug: 'owner',
    revision: '0',
    activities,
    proof: signed(activities),
  })
const update = (f, activities = payload([activity('2')]), revision = f.row.revision) =>
  mutateShare(f.store, {
    athleteId: 1,
    displayName: 'Owner',
    action: 'update',
    revision,
    activities,
    proof: signed(activities, revision),
  })
const stop = (f) => mutateShare(f.store, { athleteId: 1, displayName: null, action: 'stop', revision: f.row.revision })

// Hold an upload after bytes have reached storage, before the metadata CAS.
function holdNextUpload(f) {
  let release, reached
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const ready = new Promise((resolve) => {
    reached = resolve
  })
  const upload = f.store.upload
  f.store.upload = async (...args) => {
    const path = await upload(...args)
    reached()
    await gate
    return path
  }
  return { ready, release }
}

test('only Everyone is shared, unknown legacy records fail closed, times/properties are removed', () => {
  const result = publicActivities(
    [
      activity('1'),
      activity('2', 'followers_only'),
      activity('3', 'only_me'),
      activity('4', 'unknown'),
      { ...activity('5'), visibility: undefined },
    ],
    true,
  )
  assert.equal(result.length, 1)
  assert.equal(result[0].date, '2026-10-25')
  assert.deepEqual(result[0].feature.properties, {})
  assert.equal(result[0].visibility, undefined)
  assert.equal(publicActivities([activity()], false)[0].feature, null)
})
test('narrow scope proofs are tied to the token and expire; broad or missing scopes cannot expose routes', () => {
  assert.equal(safeRouteScope('read activity:read'), true)
  for (const scope of [undefined, 'read', 'read activity:read_all', 'activity:read activity:read_all'])
    assert.equal(safeRouteScope(scope), false)
  const proof = signProof('route-access', { token: digest('token-a') }, Date.now() + 10000)
  assert.equal(hasSafeRouteGrant(proof, 'token-a'), true)
  assert.equal(hasSafeRouteGrant(proof, 'token-b'), false)
  assert.equal(hasSafeRouteGrant(proof + 'bad', 'token-a'), false)
  assert.equal(
    hasSafeRouteGrant(signProof('route-access', { token: digest('token-a') }, Date.now() - 1), 'token-a'),
    false,
  )
})
test('tampered, expired, wrong-account and unverified snapshots are rejected before upload', async () => {
  for (const proof of [
    undefined,
    signed(payload(), '0', 2),
    signed(payload(), '0', 1, Date.now() - 1),
    signed(payload([activity('other')])),
  ]) {
    const f = fixture()
    await assert.rejects(
      mutateShare(f.store, {
        athleteId: 1,
        displayName: null,
        action: 'create',
        slug: 'owner',
        revision: '0',
        activities: payload(),
        proof,
      }),
      /sync_required|invalid_snapshot/,
    )
    assert.equal(f.uploads.size, 0)
  }
})
test('identical data skips upload and timestamp changes but fences older syncs', async () => {
  const f = fixture(),
    items = payload([activity('1'), activity('2')])
  await create(f, items)
  const before = { ...f.row }
  await update(f, [...items].reverse())
  assert.deepEqual(f.row, { ...before, revision: '2' })
  assert.equal(f.uploads.size, 1)
  await assert.rejects(update(f, payload([activity('stale')]), before.revision), /publication_changed/)
})
test('an empty successful snapshot removes every previously shared activity', async () => {
  const f = fixture()
  await create(f)
  await update(f, [])
  assert.equal(f.row.activity_count, 0)
  assert.deepEqual(JSON.parse(f.uploads.get(f.row.snapshot_path)).activities, [])
})
test('rename changes only metadata and invalidates an older update', async () => {
  const f = fixture()
  await create(f)
  const previous = { ...f.row }
  await mutateShare(f.store, {
    athleteId: 1,
    displayName: null,
    action: 'rename',
    slug: 'new-address',
    revision: previous.revision,
  })
  assert.equal(f.row.snapshot_path, previous.snapshot_path)
  assert.equal(f.row.updated_at, previous.updated_at)
  assert.equal(f.uploads.size, 1)
  await assert.rejects(update(f, payload(), previous.revision), /publication_changed/)
})
test('stop during upload wins and the stale upload is queued for cleanup', async () => {
  const f = fixture()
  await create(f)
  const gate = holdNextUpload(f),
    pending = update(f)
  await gate.ready
  await stop(f)
  gate.release()
  await assert.rejects(pending, /publication_changed/)
  assert.equal(f.row.active, false)
  assert.equal(f.row.slug, null)
  assert.equal(f.discards.length, 1)
})
test('two tab updates sharing one revision have exactly one winner', async () => {
  const f = fixture()
  await create(f)
  const gate = holdNextUpload(f),
    first = update(f, payload([activity('2')]))
  await gate.ready
  const second = update(f, payload([activity('3')]))
  gate.release()
  const results = await Promise.allSettled([first, second])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(f.row.revision, '2')
  assert.equal(f.discards.length, 1)
})
test('stop, then fresh re-share cannot be overwritten by an old in-flight request', async () => {
  const f = fixture()
  await create(f)
  const gate = holdNextUpload(f),
    pending = update(f)
  await gate.ready
  await stop(f)
  gate.release()
  await assert.rejects(pending, /publication_changed/)
  await mutateShare(f.store, {
    athleteId: 1,
    displayName: null,
    action: 'create',
    slug: 'owner',
    revision: '2',
    activities: payload(),
    proof: signed(payload(), '2'),
  })
  assert.equal(f.row.revision, '3')
  assert.equal(f.row.active, true)
})
test('storage failure preserves current snapshot; ambiguous commit errors never delete a possibly live blob', async () => {
  const f = fixture()
  await create(f)
  const before = { ...f.row },
    original = f.store.upload
  f.store.upload = async () => {
    throw new Error('storage unavailable')
  }
  await assert.rejects(update(f), /storage unavailable/)
  assert.deepEqual(f.row, before)
  f.store.upload = original
  f.store.commit = async () => {
    throw new Error('connection lost')
  }
  await assert.rejects(update(f), /connection lost/)
  assert.deepEqual(f.discards, [])
})
