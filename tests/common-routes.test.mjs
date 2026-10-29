import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { loadTs } from './load-ts.mjs'

const { createRouteComparison } = loadTs('src/lib/common-routes.ts')
const findCommonRoutes = (other, own) => createRouteComparison(other, own)()
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

const filterComparisonActivities = (activities, filters) =>
  activities.filter(
    (a) =>
      filters.types.includes(a.type || 'unknown') &&
      (filters.cutoff === null || (a.date?.getTime() ?? 0) <= filters.cutoff),
  )
const { packRoutes, unpackRoutes, routeTransfers } = loadTs('src/lib/packed-routes.ts')
const { activitiesToGeoData } = loadTs('src/lib/activities.ts')
let seed = 12345
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296
function sampledRoute(id, lat, lng, shift = 0) {
  return {
    id,
    type: random() > 0.5 ? 'running' : 'cycling',
    date: new Date(random() > 0.5 ? '2026-01-01' : '2026-10-01'),
    feature: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: Array.from({ length: 12 }, (_, i) => [lng + i * 0.0003, lat + Math.sin(i) * 0.0001 + shift]),
      },
    },
  }
}
test('optimized engine matches the original across latitudes, directions, gaps and both-library filters', () => {
  seed = 12345
  const hash = createHash('sha256')
  for (let i = 0; i < 50; i++) {
    const lat = random() * 160 - 80,
      lng = random() * 350 - 175
    const own = [sampledRoute('a', lat, lng), sampledRoute('b', lat, lng, 0.0001)]
    const other = [sampledRoute('c', lat, lng, 0.00005), sampledRoute('d', lat, lng, 0.0004)]
    if (i % 2) own[0].feature.geometry.coordinates.reverse()
    if (i % 3 === 0) other[0].feature.geometry.coordinates[5] = [NaN, 0]
    const compare = createRouteComparison(other, own)
    for (const filters of [
      undefined,
      { types: ['running'], cutoff: null },
      { types: ['cycling', 'running'], cutoff: Date.parse('2026-02-01') },
      { types: [], cutoff: null },
    ]) {
      hash.update(JSON.stringify(compare(filters)))
    }
  }
  // Golden output from the original corridor algorithm over all 200 seeded queries.
  assert.equal(hash.digest('hex'), 'e7213a84ef13b1238eca7700a1f3fa18b6f2a6069ef66b02e085ea9679838616')
})
test('packed route transfer round-trips geometry without detaching live map data', () => {
  const data = activitiesToGeoData([sampledRoute('a', 80, 179.999)])
  const packed = packRoutes(data)
  const received = structuredClone(packed, { transfer: routeTransfers(packed) })
  assert.equal(packed.coordinates.byteLength, 0)
  assert.deepEqual(unpackRoutes(received), data)
  assert.ok(data.features[0].geometry.coordinates.length)
  assert.deepEqual(unpackRoutes(packRoutes({ type: 'FeatureCollection', features: [] })), {
    type: 'FeatureCollection',
    features: [],
  })
})

test('duplicate geometry keeps eligibility from every recording without duplicating the index', () => {
  const base = sampledRoute('a', 51.5, -0.1)
  base.type = 'running'
  base.date = new Date('2026-10-01')
  const duplicate = {
    ...base,
    id: 'b',
    type: 'cycling',
    date: new Date('2026-01-01'),
    feature: structuredClone(base.feature),
  }
  const other = [{ ...base, id: 'c', date: new Date('2026-01-01'), type: 'cycling' }]
  const own = [base, duplicate]
  const compare = createRouteComparison(other, own)
  for (const filters of [
    undefined,
    { types: ['cycling'], cutoff: Date.parse('2026-02-01') },
    { types: ['running'], cutoff: null },
  ]) {
    assert.deepEqual(
      compare(filters),
      findCommonRoutes(
        filters ? filterComparisonActivities(other, filters) : other,
        filters ? filterComparisonActivities(own, filters) : own,
      ),
    )
  }
})

// Eight half-globe segments exceed the real two-million-piece limit without
// requiring a huge input fixture. The preflight must reject before allocating it.
function oversizedRoute() {
  return {
    ...sampledRoute('oversized', 0, 0),
    type: 'hiking',
    date: new Date('2026-10-01'),
    feature: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: Array.from({ length: 9 }, (_, i) => [i % 2 ? 90 : -90, 0]),
      },
    },
  }
}

test('oversized libraries compare eligible subsets and recover after a rejected broad query', () => {
  const running = { ...sampledRoute('run', 51.5, -0.1), type: 'running', date: new Date('2026-01-01') }
  const cycling = { ...sampledRoute('ride', 51.6, -0.1), type: 'cycling', date: new Date('2026-01-01') }
  const own = [running, cycling, oversizedRoute()]
  const other = [running, cycling].map((a) => ({ ...a, id: `public-${a.id}` }))
  const compare = createRouteComparison(other, own)
  assert.throws(() => compare(), /comparison_too_large/)
  const filters = [
    { types: ['running'], cutoff: null },
    { types: ['cycling'], cutoff: null },
    { types: ['running', 'cycling', 'hiking'], cutoff: Date.parse('2026-02-01') },
    { types: ['hiking'], cutoff: Date.parse('2026-02-01') },
    { types: [], cutoff: null },
    { types: ['running'], cutoff: Date.parse('2026-03-01') },
  ]
  for (const filter of filters) {
    assert.deepEqual(
      compare(filter),
      findCommonRoutes(filterComparisonActivities(other, filter), filterComparisonActivities(own, filter)),
    )
  }
  const cached = compare(filters[0])
  assert.throws(() => compare({ types: ['running', 'hiking'], cutoff: null }), /comparison_too_large/)
  assert.deepEqual(compare(filters[0]), cached)
  assert.deepEqual(compare(filters[1]), findCommonRoutes([other[1]], [cycling]))
})
