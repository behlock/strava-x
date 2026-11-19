import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { NodeNextRequest, NodeNextResponse } from 'next/dist/server/base-http/node.js'
import { sendResponse } from 'next/dist/server/send-response.js'
import { loadTs } from './load-ts.mjs'

const { readActivitySync } = loadTs('src/lib/activity-sync-stream.ts')
const api = loadTs('src/lib/api.ts')
const athleteId = '9223372036854775807'
const activity = {
  id: 'strava-9007199254740993',
  type: 'running',
  date: new Date('2026-11-18'),
  distance: 1,
  elevationGain: 0,
  feature: null,
}

async function serve(t, fetchAllActivities) {
  const { POST } = loadTs('src/app/api/activities/sync/route.ts', {
    '@/lib/api': {
      ...api,
      enforceRateLimit: () => null,
      authenticateAthlete: async () => ({ ok: true, athlete: { athleteId, displayName: null } }),
    },
    '@/lib/strava': { fetchAllActivities },
    '@/lib/activity-sync-db': { getActivityVersion: async () => 'test:1' },
    '@/lib/sharing-db': {
      ensureShare: async () => {
        throw new Error('isolated personal sync')
      },
    },
  })
  const server = createServer((req, res) => {
    void (async () => {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: Buffer.concat(chunks),
      })
      // Exercise Next's real HTTP sender: it strips handler Content-Encoding.
      // Testing the Response object alone misses accidentally gzipped JSON.
      await sendResponse(new NodeNextRequest(req), new NodeNextResponse(res), await POST(request))
    })().catch((error) => res.destroy(error))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve)
        server.closeAllConnections()
      }),
  )
  return (accept) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/activities/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: accept },
      body: JSON.stringify({ accessToken: 'test-token' }),
      signal: AbortSignal.timeout(4000),
    })
}

test('buffered sync is readable JSON after Next sends it over HTTP', { timeout: 5000 }, async (t) => {
  const request = await serve(t, async (_token, { onBatch }) => onBatch([activity]))
  const response = await request('application/json')
  assert.equal(response.status, 200)
  const result = await readActivitySync(response, new AbortController().signal, () => assert.fail())
  assert.equal(result.athleteId, athleteId)
  assert.equal(result.activities[0].id, activity.id)
})

test(
  'progressive sync remains readable and emits previews through Next before completion',
  { timeout: 5000 },
  async (t) => {
    const finish = Promise.withResolvers()
    const preview = Promise.withResolvers()
    const request = await serve(t, async (_token, { onBatch }) => {
      onBatch([activity])
      await finish.promise
    })
    const response = await request('application/x-ndjson')
    const pending = readActivitySync(response, new AbortController().signal, (id, batch) => {
      assert.equal(id, athleteId)
      assert.equal(batch[0].id, activity.id)
      preview.resolve()
    })
    let completed = false
    pending.then(() => {
      completed = true
    }, preview.reject)
    try {
      await preview.promise
      assert.equal(completed, false)
    } finally {
      finish.resolve()
    }
    const result = await pending
    assert.equal(result.activities.length, 1)
    assert.equal(result.athleteId, athleteId)
  },
)
