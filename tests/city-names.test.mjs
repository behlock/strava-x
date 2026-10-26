import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { findUrbanCentre, containsPoint, projectToMollweide } = loadTs('src/lib/urban-centres.ts')
const { resolveCity } = loadTs('src/lib/city-names.ts')

// Settlement fields reflect address-level geocoding, independent of our urban-area dataset.
const cases = [
  ['Uccle municipality', 50.802, 4.339, 'Uccle - Ukkel', 'Brussels'],
  ['Mtaileb municipality', 33.921, 35.616, 'Mtaileb', 'Beirut'],
  ['Westminster borough', 51.5, -0.13, 'Greater London', 'London'],
  ['Futian district', 22.54, 114.06, 'Shenzhen', 'Shenzhen'],
  ['Shinjuku ward', 35.69, 139.7, 'Tokyo', 'Tokyo'],
  ['Oakland within the Bay Area', 37.8, -122.27, 'Oakland', 'Oakland'],
  ['San Francisco', 37.77, -122.42, 'San Francisco', 'San Francisco'],
  ['Bandra suburb', 19.06, 72.83, 'Mumbai', 'Mumbai'],
  ['Versailles municipality', 48.801, 2.13, 'Versailles', 'Paris'],
  ['São Paulo', -23.55, -46.63, 'São Paulo', 'São Paulo'],
  ['Cape Town', -33.92, 18.42, 'Cape Town', 'Cape Town'],
  ['Sydney', -33.87, 151.21, 'Sydney', 'Sydney'],
  ['Auckland', -36.85, 174.76, 'Auckland', 'Auckland'],
  ['Cairo', 30.04, 31.24, 'Cairo', 'Cairo'],
]
for (const [label, lat, lng, city, expected] of cases) {
  test(`global city data: ${label}`, async () => {
    const urban = await findUrbanCentre(lat, lng)
    assert(urban, 'Expected an actual containing urban polygon')
    assert.equal(resolveCity({ city }, urban).name, expected)
  })
}

test('rural towns and villages are not absorbed into a nearby large city', async () => {
  for (const [lat, lng, address, expected] of [
    [34.01, 35.82, { village: 'Faraya' }, 'Faraya'],
    [50.874, 0.008, { town: 'Lewes' }, 'Lewes'],
    [43.143, 2.79, { village: 'Boutenac' }, 'Boutenac'],
  ]) {
    assert.equal(await findUrbanCentre(lat, lng), null)
    assert.equal(resolveCity(address, null).name, expected)
  }
  assert.equal(resolveCity({ county: 'A district', state: 'A region' }, null), null)
  assert.equal(resolveCity(undefined, null), null)
})

test('city identities are stable across suburbs and distinct across urban members', async () => {
  const brussels = await findUrbanCentre(50.802, 4.339)
  assert.equal(resolveCity({ city: 'Uccle' }, brussels).id, resolveCity({ city: 'Brussels' }, brussels).id)
  const bayArea = await findUrbanCentre(37.8, -122.27)
  assert.notEqual(resolveCity({ city: 'Oakland' }, bayArea).id, resolveCity({ city: 'San Francisco' }, bayArea).id)
  assert.notEqual(
    resolveCity({ city: 'London', country_code: 'gb' }, null).id,
    resolveCity({ city: 'London', country_code: 'ca' }, null).id,
  )
})

test('polygon membership respects holes and disconnected parts instead of using bounding boxes', () => {
  const centre = {
    bounds: [0, 0, 30, 30],
    polygons: [
      [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [3, 3],
          [7, 3],
          [7, 7],
          [3, 7],
          [3, 3],
        ],
      ],
      [
        [
          [20, 20],
          [30, 20],
          [30, 30],
          [20, 30],
          [20, 20],
        ],
      ],
    ],
  }
  assert.equal(containsPoint(centre, 1, 1), true)
  assert.equal(containsPoint(centre, 5, 5), false)
  assert.equal(containsPoint(centre, 15, 15), false)
  assert.equal(containsPoint(centre, 25, 25), true)
  assert.equal(containsPoint(centre, -1, 0), false)
  assert.equal(containsPoint(centre, 0, 5), true)
})

test('projection agrees with PROJ ESRI:54009 reference coordinates', () => {
  for (const [lat, lng, expected] of [
    [0, 0, [0, 0]],
    [51.5, -0.13, [-9690.137482231296, 6029637.628965634]],
    [89.99, 179.99, [59501.2643671976, 9019998.779549254]],
  ]) {
    const result = projectToMollweide(lat, lng)
    result.forEach((value, i) => assert(Math.abs(value - expected[i]) < 0.001))
  }
  assert(projectToMollweide(90, 180).every(Number.isFinite))
  assert(projectToMollweide(-90, -180).every(Number.isFinite))
  assert(projectToMollweide(89.9999999, 180).every(Number.isFinite))
  assert(projectToMollweide(-89.9999999, -180).every(Number.isFinite))
})
