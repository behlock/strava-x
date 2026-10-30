import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const socket = process.env.SHARING_TEST_PG_SOCKET
const exec = promisify(execFile)
// This suite deliberately accepts only our disposable Unix socket, never a
// database URL or ambient POSTGRES_URL (which may be production credentials).
if (socket && !/^\/tmp\/strava-sharing-pg\.[a-zA-Z0-9]+$/.test(socket))
  throw new Error('Use a disposable test database socket')
const literal = (value) =>
  Array.isArray(value)
    ? `ARRAY[${value.map(literal).join(',')}]::text[]`
    : value == null
      ? 'NULL'
      : typeof value === 'boolean'
        ? String(value)
        : "'" + String(value).replaceAll("'", "''") + "'"
async function query(sql) {
  const result = await exec('psql', [
    '-X',
    '-q',
    '-A',
    '-t',
    '-v',
    'ON_ERROR_STOP=1',
    '-h',
    socket,
    '-p',
    '55439',
    '-U',
    'sharing_test',
    '-d',
    'postgres',
    '-c',
    sql,
  ])
  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}
const sql = async (parts, ...values) => {
  let text = parts.reduce((out, part, index) => out + part + (index < values.length ? literal(values[index]) : ''), '')
  text = text
    .replace('SELECT slug FROM map_shares', "SELECT json_build_object('slug',slug) FROM map_shares")
    .replace(
      'SELECT version FROM athlete_activity_versions',
      "SELECT json_build_object('version',version) FROM athlete_activity_versions",
    )
    .replace('RETURNING version', "RETURNING json_build_object('version',version)")
    .replace('SELECT * FROM changed', 'SELECT row_to_json(changed) FROM changed')
    .replaceAll('SELECT * FROM map_shares', 'SELECT row_to_json(map_shares) FROM map_shares')
    .replace(
      'SELECT pathname, store FROM sharing_blob_cleanup',
      'SELECT row_to_json(sharing_blob_cleanup) FROM sharing_blob_cleanup',
    )
  return query(text)
}
const db = loadTs('src/lib/sharing-db.ts', { '@neondatabase/serverless': { neon: () => sql } })
const syncDb = loadTs('src/lib/activity-sync-db.ts', { '@neondatabase/serverless': { neon: () => sql } })
const write = (slug, path) => ({
  slug,
  active: true,
  displayName: 'Test',
  snapshotPath: path,
  fingerprint: path,
  activityCount: 1,
  sizeBytes: 10,
  updatedAt: '2026-10-25T12:00:00Z',
})

test(
  'real Postgres: migration quarantine, competing CAS, tombstone, slug uniqueness, cleanup queue',
  { skip: !socket },
  async () => {
    await query('DROP TABLE IF EXISTS sharing_blob_cleanup, map_shares, published_maps CASCADE')
    await query(readFileSync('db/001_published_maps.sql', 'utf8'))
    await query(
      "INSERT INTO published_maps (slug,athlete_id,blob_url,blob_pathname,activity_count,size_bytes) VALUES ('legacy',1,'https://example.invalid/legacy.json','published/1/legacy.json',1,1)",
    )
    await query(readFileSync('db/003_safe_sharing.sql', 'utf8'))
    await query(readFileSync('db/006_map_gallery.sql', 'utf8'))
    const legacy = await db.findShareBySlug('legacy')
    assert.equal(legacy.snapshot_path, null)
    assert.equal((await db.cleanupCandidates())[0].store, 'legacy')
    const initial = await db.ensureShare(2)
    const results = await Promise.all([
      db.compareAndSwapShare(initial, write('second', 'path-a')),
      db.compareAndSwapShare(initial, write('second', 'path-b')),
    ])
    assert.equal(results.filter(Boolean).length, 1)
    const winner = results.find(Boolean)
    assert.equal(winner.revision, '1')
    const other = await db.ensureShare(3)
    await assert.rejects(db.compareAndSwapShare(other, write('second', 'path-c')), /duplicate key/)
    const stopped = await db.compareAndSwapShare(winner, {
      ...write(null, null),
      active: false,
      fingerprint: null,
      activityCount: 0,
      sizeBytes: 0,
    })
    assert.equal(stopped.revision, '2')
    assert.equal(await db.findShareBySlug('second'), null)
    assert.equal(await db.compareAndSwapShare(winner, write('second', 'stale')), null)
    const queued = await db.cleanupCandidates()
    assert(queued.some((item) => item.pathname === winner.snapshot_path && item.store === 'private'))
    await db.queueBlobCleanup('orphan')
    await db.queueBlobCleanup('orphan')
    assert.equal((await db.cleanupCandidates()).filter((item) => item.pathname === 'orphan').length, 1)
    await db.acknowledgeCleanup('orphan')
    assert(!(await db.cleanupCandidates()).some((item) => item.pathname === 'orphan'))
    // A stopped address is available to someone else; its former owner cannot
    // recreate it using a request captured before stopping.
    assert(await db.compareAndSwapShare(other, write('second', 'path-c')))
    assert.equal(await db.compareAndSwapShare(winner, write('second', 'late')), null)

    await query('DROP TABLE IF EXISTS athlete_activity_versions')
    await query(readFileSync('db/004_activity_sync_versions.sql', 'utf8'))
    assert.equal(await syncDb.getActivityVersion(2), 'poll:0')
    await syncDb.recordActivityChange(2, 'event-a', false)
    assert.equal(await syncDb.getActivityVersion(2), 'poll:1')
    await syncDb.recordActivityChange(2, 'event-a', false)
    assert.equal(await syncDb.getActivityVersion(2), 'poll:1')
    await syncDb.recordActivityChange(2, 'event-b', false)
    assert.equal(await syncDb.getActivityVersion(2), 'poll:2')
    assert.equal(await syncDb.getActivityVersion(4), 'poll:0')
    // Revocation also covers published users who have not used the new cache yet.
    await syncDb.recordActivityChange(3, 'revoked', true)
    assert.equal(await db.findShareBySlug('second'), null)
    assert((await db.cleanupCandidates()).some((item) => item.pathname === 'path-c'))
    const pending = await db.ensureShare(5)
    await syncDb.recordActivityChange(5, 'revoked-before-publish', true)
    const revoked = await db.ensureShare(5)
    assert.equal(revoked.revision, '1')
    assert.equal(await db.compareAndSwapShare(pending, write('pending', 'pending-path')), null)
    await syncDb.recordActivityChange(5, 'revoked-before-publish', true)
    assert.equal((await db.ensureShare(5)).revision, revoked.revision)
    const racing = await db.ensureShare(6)
    const [, published] = await Promise.all([
      syncDb.recordActivityChange(6, 'revoked-during-publish', true),
      db.compareAndSwapShare(racing, write('racing', 'racing-path')),
    ])
    assert.equal(await db.findShareBySlug('racing'), null)
    if (published) assert((await db.cleanupCandidates()).some((item) => item.pathname === 'racing-path'))

    const fresh = await db.ensureShare(7)
    const visible = await db.compareAndSwapShare(fresh, write('deletion-test', 'before-deletion'))
    await syncDb.recordActivityChange(7, 'activity-deleted', false, true)
    const invalidated = await db.findShareBySlug('deletion-test')
    assert.equal(invalidated.active, true)
    assert.equal(invalidated.snapshot_path, null)
    assert.equal(invalidated.fingerprint, null)
    assert.notEqual(invalidated.revision, visible.revision)
    assert.equal(await db.compareAndSwapShare(visible, write('deletion-test', 'stale-proof')), null)
    assert((await db.cleanupCandidates()).some((item) => item.pathname === 'before-deletion'))
    await syncDb.recordActivityChange(7, 'activity-deleted', false, true)
    assert.equal((await db.ensureShare(7)).revision, invalidated.revision)
    assert(await db.compareAndSwapShare(invalidated, write('deletion-test', 'verified-new-snapshot')))

    // Exercise the actual PostgreSQL selection and array parameters, not just SQL shape.
    assert.equal(await db.randomPublishedMap(null), 'deletion-test')
    assert.equal(await db.randomPublishedMap('deletion-test', ['deletion-test']), 'deletion-test')
    await db.compareAndSwapShare(await db.ensureShare(8), write('explore-second', 'explore-second-path'))
    await db.compareAndSwapShare(await db.ensureShare(9), write('explore-third', 'explore-third-path'))
    assert.equal(await db.randomPublishedMap('deletion-test', ['deletion-test', 'explore-second']), 'explore-third')
    assert.notEqual(
      await db.randomPublishedMap('deletion-test', ['deletion-test', 'explore-second', 'explore-third']),
      'deletion-test',
    )

    const cleanupMigration = readFileSync('db/005_drop_legacy_published_maps.sql', 'utf8')
    await query('DELETE FROM map_shares WHERE athlete_id=1')
    await assert.rejects(query(cleanupMigration), /accounts missing from map_shares/)
    await db.ensureShare(1)
    const sharesBeforeDrop = await query('SELECT row_to_json(map_shares) FROM map_shares ORDER BY athlete_id')
    const cleanupBeforeDrop = await db.cleanupCandidates()
    await query(cleanupMigration)
    assert.deepEqual(
      await query("SELECT json_build_object('exists', to_regclass('public.published_maps') IS NOT NULL)"),
      [{ exists: false }],
    )
    assert.deepEqual(
      await query('SELECT row_to_json(map_shares) FROM map_shares ORDER BY athlete_id'),
      sharesBeforeDrop,
    )
    assert.deepEqual(await db.cleanupCandidates(), cleanupBeforeDrop)
    await query(cleanupMigration)
  },
)
