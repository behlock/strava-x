import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { loadTs } from './load-ts.mjs'

const { routePaint } = loadTs('src/lib/route-paint.ts')
const { validate } = createRequire(import.meta.url)('mapbox-gl/dist/style-spec/index.cjs')

test('route paint validates against the installed Mapbox specification in both themes and selection states', () => {
  for (const dark of [false, true]) {
    for (const selected of [false, true]) {
      const errors = validate({
        version: 8,
        sources: { routes: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
        layers: [{ id: 'routes', source: 'routes', type: 'line', paint: routePaint(dark, selected) }],
      })
      assert.deepEqual(
        errors.map((error) => error.message),
        [],
        `dark=${dark}, selected=${selected}`,
      )
    }
  }
})
