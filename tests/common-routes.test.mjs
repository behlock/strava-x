import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { findCommonRoutes } = loadTs('src/lib/common-routes.ts')
const degree = 180 / (Math.PI * 6_371_000)
const line = (id, metres, type = 'running') => ({
  id,
  type,
  date: new Date('2026-01-01'),
  distance: 1,
  elevationGain: 0,
  feature: {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: metres.map(([x, y]) => [x * degree, y * degree]) },
  },
})
const compare = (publicRoute, ownRoute) => findCommonRoutes([publicRoute], [ownRoute]).features

test('matches shared corridors across sports, reverse direction, and different GPS sampling', () => {
  const publicRoute = line('public', [
    [0, 0],
    [500, 0],
  ])
  const ownRoute = line(
    'own',
    Array.from({ length: 101 }, (_, i) => [500 - i * 5, 12]),
    'cycling',
  )
  const result = compare(publicRoute, ownRoute)
  assert.equal(result.length, 1)
  assert.deepEqual(result[0].properties, { id: 'public', type: 'running', dateTs: publicRoute.date.getTime() })
  assert.ok(
    result[0].geometry.coordinates.every(([, lat]) => lat === 0),
    'only public geometry is returned',
  )
})

test('clips a long public segment to the shared portion instead of highlighting the whole activity', () => {
  const features = compare(
    line('public', [
      [0, 0],
      [1000, 0],
    ]),
    line('own', [
      [300, 0],
      [600, 0],
    ]),
  )
  assert.equal(features.length, 1)
  const coords = features[0].geometry.coordinates
  assert.ok(coords[0][0] / degree >= 275)
  assert.ok(coords.at(-1)[0] / degree <= 625)
})

test('rejects crossings, nearby parallel roads outside the tolerance, and short coincidences', () => {
  const route = line('public', [
    [0, 0],
    [500, 0],
  ])
  assert.equal(
    compare(
      route,
      line('crossing', [
        [250, -300],
        [250, 300],
      ]),
    ).length,
    0,
  )
  assert.equal(
    compare(
      route,
      line('parallel', [
        [0, 35],
        [500, 35],
      ]),
    ).length,
    0,
  )
  assert.equal(
    compare(
      route,
      line('short', [
        [200, 0],
        [240, 0],
      ]),
    ).length,
    0,
  )
})

test('does not join separated shared stretches across an unmatched gap', () => {
  const result = findCommonRoutes(
    [
      line('public', [
        [0, 0],
        [1000, 0],
      ]),
    ],
    [
      line('first', [
        [0, 0],
        [200, 0],
      ]),
      line('last', [
        [700, 0],
        [1000, 0],
      ]),
    ],
  )
  assert.equal(result.features.length, 2)
  assert.ok(result.features[0].geometry.coordinates.at(-1)[0] / degree < 250)
  assert.ok(result.features[1].geometry.coordinates[0][0] / degree > 650)
})

test('preserves turns and does not infer a shortcut through a bend', () => {
  const bent = line('bent', [
    [0, 0],
    [200, 0],
    [200, 200],
  ])
  assert.equal(
    compare(
      bent,
      line('shortcut', [
        [0, 0],
        [200, 200],
      ]),
    ).length,
    0,
  )
  assert.equal(compare(bent, { ...bent, id: 'same-bend' }).length, 1)
})

test('handles empty, duplicate and invalid coordinates without connecting gaps', () => {
  assert.deepEqual(findCommonRoutes([], []), { type: 'FeatureCollection', features: [] })
  const malformed = line('bad', [
    [0, 0],
    [0, 0],
    [200, 0],
    [NaN, 0],
    [400, 0],
    [600, 0],
  ])
  assert.equal(
    compare(
      malformed,
      line('own', [
        [0, 0],
        [600, 0],
      ]),
    ).length,
    2,
  )
  assert.equal(findCommonRoutes([{ ...malformed, feature: null }], [malformed]).features.length, 0)
})

test('matching works at high latitudes and across the antimeridian', () => {
  for (const coordinates of [
    [
      [20, 80],
      [20.03, 80],
    ],
    [
      [179.998, 0],
      [-179.998, 0],
    ],
  ]) {
    const route = line('public', [])
    route.feature.geometry.coordinates = coordinates
    const own = structuredClone(route)
    own.feature.geometry.coordinates.reverse()
    assert.equal(compare(route, own).length, 1)
  }
})

test('repeated visits do not multiply the returned geometry for a public activity', () => {
  const route = line('public', [
    [0, 0],
    [500, 0],
  ])
  assert.equal(findCommonRoutes([route], Array(20).fill(route)).features.length, 1)
})
