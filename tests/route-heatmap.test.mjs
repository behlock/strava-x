import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { loadTs } from './load-ts.mjs'

const { sampleRouteHeatmap } = loadTs('src/lib/route-heatmap.ts')
const { comparisonLinePaint, comparisonGlowPaint, personalRouteColor, personalRoutePaint } =
  loadTs('src/lib/comparison-paint.ts')
const { heatmapPaint, heatmapColors } = loadTs('src/lib/heatmap-paint.ts')
const { routePaint } = loadTs('src/lib/route-paint.ts')
const { COMPARISON_PALETTES, COMPARISON_RENDER_MODES } = loadTs('src/lib/comparison-appearance.ts')
const { validate } = createRequire(import.meta.url)('mapbox-gl/dist/style-spec/index.cjs')
const degree = 180 / (Math.PI * 6_371_000)
const line = (coordinates, id = 'route') => ({
  type: 'Feature',
  properties: { id, type: 'running', dateTs: 123 },
  geometry: { type: 'LineString', coordinates },
})
const collection = (...features) => ({ type: 'FeatureCollection', features })

test('heat intensity depends on travelled distance, not GPS vertex density', () => {
  const sparse = sampleRouteHeatmap(
    collection(
      line([
        [0, 0],
        [950 * degree, 0],
      ]),
    ),
  )
  const dense = sampleRouteHeatmap(collection(line(Array.from({ length: 96 }, (_, i) => [i * 10 * degree, 0]))))
  assert.equal(sparse.features.length, 10)
  assert.equal(dense.features.length, sparse.features.length)
  for (let i = 0; i < sparse.features.length; i++) {
    assert.ok(Math.abs(sparse.features[i].geometry.coordinates[0] - dense.features[i].geometry.coordinates[0]) < 1e-9)
    assert.ok(Math.abs(sparse.features[i].properties.weight - dense.features[i].properties.weight) < 1e-8)
  }
  assert.ok(Math.abs(sparse.features.reduce((sum, p) => sum + p.properties.weight, 0) - 9.5) < 1e-8)
})

test('repeated activities add heat while retaining ids, dates, and sports for filters', () => {
  const coordinates = [
    [0, 0],
    [950 * degree, 0],
  ]
  const result = sampleRouteHeatmap(collection(line(coordinates, 'one'), line(coordinates, 'two')))
  assert.equal(result.features.length, 20)
  assert.deepEqual(new Set(result.features.map((p) => p.properties.id)), new Set(['one', 'two']))
  assert.ok(result.features.every((p) => p.properties.type === 'running' && p.properties.dateTs === 123))
})

test('short tracks contribute proportionally; duplicates and invalid coordinates do not create heat', () => {
  const result = sampleRouteHeatmap(
    collection(
      line([
        [0, 0],
        [0, 0],
        [20 * degree, 0],
      ]),
    ),
  )
  assert.equal(result.features.length, 1)
  assert.ok(Math.abs(result.features[0].properties.weight - 0.2) < 1e-8)
  assert.equal(
    sampleRouteHeatmap(
      collection(
        line([
          [0, 0],
          [NaN, 0],
          [1, 1],
        ]),
      ),
    ).features.length,
    0,
  )
  assert.equal(
    sampleRouteHeatmap(
      collection(
        line([
          [0, 0],
          [0, 0],
        ]),
      ),
    ).features.length,
    0,
  )
  assert.deepEqual(sampleRouteHeatmap(collection()), collection())
})

test('samples stay on either side of invalid gaps and cross the dateline locally', () => {
  const gap = sampleRouteHeatmap(
    collection(
      line([
        [0, 0],
        [200 * degree, 0],
        [NaN, NaN],
        [1, 0],
        [1 + 200 * degree, 0],
      ]),
    ),
  )
  assert.ok(gap.features.every((p) => p.geometry.coordinates[0] <= 200 * degree || p.geometry.coordinates[0] >= 1))
  const seam = sampleRouteHeatmap(
    collection(
      line([
        [179.999, 0],
        [-179.999, 0],
      ]),
    ),
  )
  assert.ok(seam.features.length > 0 && seam.features.length < 5)
  assert.ok(seam.features.every((p) => Math.abs(p.geometry.coordinates[0]) > 179.99))
})

test('every palette and render mode validates against the installed Mapbox specification', () => {
  for (const palette of COMPARISON_PALETTES) {
    for (const theme of ['light', 'dark']) {
      for (const mode of COMPARISON_RENDER_MODES) {
        const colors = palette[theme]
        const layers = ['own', 'other', 'overlap'].flatMap((role) => [
          { id: role, type: 'line', source: 'routes', paint: comparisonLinePaint(colors[role], role, mode.id) },
          { id: `${role}-glow`, type: 'line', source: 'routes', paint: comparisonGlowPaint(colors[role]) },
          {
            id: `${role}-heat`,
            type: 'heatmap',
            source: 'points',
            paint: heatmapPaint(theme === 'dark', 0.85, colors[role]),
          },
        ])
        const personalColor = personalRouteColor(palette.id, theme === 'dark')
        layers.push(
          ...[false, true].map((highlighted) => ({
            id: `personal-${highlighted}`,
            type: 'line',
            source: 'routes',
            paint: personalRoutePaint(theme === 'dark', personalColor, mode.id, highlighted),
          })),
          { id: 'personal-heat', type: 'heatmap', source: 'points', paint: heatmapPaint(theme === 'dark') },
        )
        const errors = validate({
          version: 8,
          sources: { routes: { type: 'geojson', data: collection() }, points: { type: 'geojson', data: collection() } },
          layers,
        })
        assert.deepEqual(
          errors.map((error) => error.message),
          [],
          `${palette.id}/${theme}/${mode.id}`,
        )
      }
    }
  }
})

test('personal graphite routes preserve the original appearance and highlighting', () => {
  for (const dark of [false, true]) {
    for (const highlighted of [false, true]) {
      const original = routePaint(dark, highlighted)
      const personal = personalRoutePaint(dark, personalRouteColor('graphite', dark), 'routes', highlighted)
      for (const [key, value] of Object.entries(original)) assert.deepEqual(personal[key], value)
      assert.deepEqual(personal['line-dasharray'], [1, 0])
    }
  }
})

test('stone heatmaps adapt to the theme and preserve intensity when dimming selection', () => {
  for (const dark of [false, true]) {
    const normal = heatmapPaint(dark)
    const dimmed = heatmapPaint(dark, 0.15)
    assert.equal(normal['heatmap-color'].at(-1), heatmapColors(dark).at(-1))
    assert.deepEqual(dimmed['heatmap-color'], normal['heatmap-color'])
    assert.ok(dimmed['heatmap-opacity'] < normal['heatmap-opacity'])
  }
  assert.notDeepEqual(heatmapPaint(false)['heatmap-color'], heatmapPaint(true)['heatmap-color'])
})
