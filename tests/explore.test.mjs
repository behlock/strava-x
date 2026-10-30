import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

test('explore redirects without caching and excludes the current map', async () => {
  let excluded
  const { GET } = loadTs('src/app/explore/route.ts', {
    '@/lib/explore': {
      pickExploreMap: async (value) => {
        excluded = value
        return 'another-map'
      },
    },
  })
  const response = await GET(new Request('https://example.com/explore?from=my-map'))
  assert.equal(excluded, 'my-map')
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), '/another-map')
  assert.match(response.headers.get('cache-control'), /no-store/)
})

test('empty community returns home and arbitrary destinations cannot redirect externally', async () => {
  for (const slug of [null, '//evil.example', 'explore']) {
    const { GET } = loadTs('src/app/explore/route.ts', {
      '@/lib/explore': { pickExploreMap: async () => slug },
    })
    const response = await GET(new Request('https://example.com/explore'))
    assert.equal(response.headers.get('location'), '/')
  }
})

test('random selection uses only active published snapshots and deprioritizes the current map', async () => {
  let query, values
  const { randomPublishedMap } = loadTs('src/lib/sharing-db.ts', {
    '@neondatabase/serverless': {
      neon:
        () =>
        async (strings, ...args) => {
          query = strings.join('?')
          values = args
          return [{ slug: 'friend' }]
        },
    },
  })
  assert.equal(await randomPublishedMap('my-map'), 'friend')
  assert.match(query, /WHERE active AND slug IS NOT NULL AND snapshot_path IS NOT NULL/)
  assert.match(query, /CASE WHEN slug = ANY/)
  assert.deepEqual(values, [null, 'my-map', []])
})

test('explore remembers visited maps and starts a new cycle when the pool is exhausted', async () => {
  let seen
  let target = 'third-map'
  const { GET } = loadTs('src/app/explore/route.ts', {
    '@/lib/explore': {
      pickExploreMap: async (_current, visited) => {
        seen = visited
        return target
      },
    },
  })
  const request = () =>
    new Request('https://example.com/explore?from=second-map', {
      headers: { cookie: 'explore_seen=first-map,second-map' },
    })
  let response = await GET(request())
  assert.deepEqual(seen, ['first-map', 'second-map'])
  assert.match(response.headers.get('set-cookie'), /^explore_seen=first-map,second-map,third-map;/)
  target = 'first-map'
  response = await GET(request())
  assert.match(response.headers.get('set-cookie'), /^explore_seen=second-map,first-map;/)
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Secure/)
})

test('Explore passes own-map exclusion independently of current map and history', async () => {
  let args
  const { GET } = loadTs('src/app/explore/route.ts', {
    '@/lib/explore': {
      pickExploreMap: async (...values) => {
        args = values
        return 'another-map'
      },
    },
  })
  await GET(new Request('https://example.com/explore?from=friend&own=my-map'))
  assert.deepEqual(args, ['friend', ['friend'], 'my-map'])
})
