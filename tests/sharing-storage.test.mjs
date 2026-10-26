import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

test('writes use unique immutable private paths; no fallback to the legacy public token', async () => {
  const calls = []
  process.env.PRIVATE_BLOB_READ_WRITE_TOKEN = 'private-test-token'
  const { writePrivateSnapshot } = loadTs('src/lib/sharing-storage.ts', {
    '@vercel/blob': {
      put: async (path, body, options) => {
        calls.push({ path, body, options })
        return { pathname: path }
      },
    },
    './sharing-db': {},
  })
  const first = await writePrivateSnapshot(1, 'one'),
    second = await writePrivateSnapshot(1, 'two')
  assert.notEqual(first, second)
  assert.equal(calls[0].options.access, 'private')
  assert.equal(calls[0].options.allowOverwrite, false)
  delete process.env.PRIVATE_BLOB_READ_WRITE_TOKEN
  process.env.BLOB_READ_WRITE_TOKEN = 'legacy-public-token'
  await assert.rejects(writePrivateSnapshot(1, 'three'), /sharing_not_configured/)
  assert.equal(calls.length, 2)
})
test('failed blob cleanup stays queued for retry', async () => {
  const acknowledged = []
  process.env.PRIVATE_BLOB_READ_WRITE_TOKEN = 'private-test-token'
  const { drainBlobCleanup } = loadTs('src/lib/sharing-storage.ts', {
    '@vercel/blob': {
      del: async (path) => {
        if (path === 'failed') throw new Error('unavailable')
      },
    },
    './sharing-db': {
      cleanupCandidates: async () => [
        { pathname: 'failed', store: 'private' },
        { pathname: 'success', store: 'private' },
      ],
      acknowledgeCleanup: async (path) => acknowledged.push(path),
    },
  })
  await drainBlobCleanup()
  assert.deepEqual(acknowledged, ['success'])
})
