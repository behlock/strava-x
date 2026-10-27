import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

async function environment(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]))
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await run()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('production and Vercel never read local map fixtures', async () => {
  const { loadLocalMap } = loadTs('src/lib/local-map.ts', {
    'node:fs/promises': { readFile: () => assert.fail('must not read local files') },
  })
  for (const vars of [
    { NODE_ENV: 'production', VERCEL: undefined },
    { NODE_ENV: 'development', VERCEL: '1' },
  ]) {
    await environment(vars, async () => assert.equal(await loadLocalMap('pierre'), null))
  }
})

test('development reads only valid map slugs and handles missing or malformed fixtures', async () => {
  const payload = { version: 1, activities: [] }
  let reads = 0
  let contents = JSON.stringify(payload)
  const { loadLocalMap } = loadTs('src/lib/local-map.ts', {
    'node:fs/promises': {
      readFile: async (path) => {
        reads++
        assert.ok(path.endsWith('/.local-maps/pierre.json'))
        if (contents === null) throw new Error('ENOENT')
        return contents
      },
    },
  })
  await environment({ NODE_ENV: 'development', VERCEL: undefined }, async () => {
    assert.equal(await loadLocalMap('../pierre'), null)
    assert.equal(reads, 0)
    assert.deepEqual(await loadLocalMap('pierre'), payload)
    for (const value of ['invalid JSON', '{"version":2,"activities":[]}', null]) {
      contents = value
      assert.equal(await loadLocalMap('pierre'), null)
    }
  })
})
