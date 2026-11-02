import assert from 'node:assert/strict'
import test from 'node:test'
import geojsonvt from 'geojson-vt'
import { inflateSync } from 'node:zlib'
import { loadTs } from './load-ts.mjs'
const { rasterizePathHeat, heatColor, visibleHeatTiles, HEAT_SIZE } = loadTs('src/lib/path-heat.ts')
const { encodePng } = loadTs('src/lib/png.ts')
const filter = { types: ['running'], cutoff: null }
const feature = (geometry, id = 'one', type = 'running', dateTs = 1) => ({
  type: 2,
  geometry: [geometry],
  tags: { id, type, dateTs },
})
const pixels = (features, f = filter) => rasterizePathHeat({ features }, f)
const line = [
  [0, 2048],
  [4096, 2048],
]

test('paths are continuous and independent of GPS recording density or segment direction', () => {
  const sparse = pixels([feature(line)])
  const dense = pixels([feature(Array.from({ length: 129 }, (_, i) => [i * 32, 2048]))])
  assert.deepEqual(sparse, dense)
  assert.deepEqual(sparse, pixels([feature([...line].reverse())]))
  for (let x = 0; x < HEAT_SIZE; x++) assert.ok(sparse[(255 * HEAT_SIZE + x) * 4 + 3] > 0)
})

test('separate activities build colour density; repeated segments in one activity do not double count', () => {
  const once = pixels([feature(line)])
  assert.deepEqual(once, pixels([feature([...line, ...[...line].reverse()])]))
  assert.notDeepEqual(once, pixels([feature(line), feature(line, 'two')]))
  assert.notDeepEqual(heatColor(1, false), heatColor(16, false))
  assert.deepEqual(heatColor(16, false), heatColor(1000, false))
})

test('sports and dates filter contributions before density accumulation', () => {
  const once = pixels([feature(line)])
  assert.deepEqual(once, pixels([feature(line), feature(line, 'two', 'cycling')]))
  assert.deepEqual(once, pixels([feature(line), feature(line, 'two', 'running', 10)], { ...filter, cutoff: 5 }))
  assert.ok(pixels([feature(line)], { types: [], cutoff: null }).every((n) => n === 0))
})

test('parallel paths retain a clear gap and colour does not depend on feature order', () => {
  const a = feature([
    [0, 2000],
    [4096, 2000],
  ])
  const b = feature(
    [
      [0, 2096],
      [4096, 2096],
    ],
    'two',
  )
  const result = pixels([a, b])
  assert.deepEqual(result, pixels([b, a]))
  assert.equal(result[(256 * HEAT_SIZE + 256) * 4 + 3], 0)
})

test('buffered neighbouring tiles give identical edge values for a crossing path', () => {
  const data = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { id: 'one', type: 'running', dateTs: 1 },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-30, 20],
            [30, 20],
          ],
        },
      },
    ],
  }
  const index = geojsonvt(data, { maxZoom: 16, tolerance: 0, buffer: 64 })
  const left = rasterizePathHeat(index.getTile(2, 1, 1), filter)
  const right = rasterizePathHeat(index.getTile(2, 2, 1), filter)
  for (let y = 0; y < HEAT_SIZE; y++)
    assert.deepEqual(
      left.slice((y * HEAT_SIZE + 511) * 4, (y * HEAT_SIZE + 512) * 4),
      right.slice(y * HEAT_SIZE * 4, (y * HEAT_SIZE + 1) * 4),
    )
})

test('viewport selection is bounded and supports wrapped longitude', () => {
  const tiles = visibleHeatTiles(179, -1, -179, 1, 8)
  assert.ok(tiles.length > 0 && tiles.length <= 48)
  assert.ok(tiles.some((tile) => tile.x >= 2 ** tile.z))
  assert.ok(visibleHeatTiles(-180, -85, 180, 85, 16).length <= 48)
})

test('server PNG preserves the exact worker RGBA raster', () => {
  const rgba = pixels([feature(line)])
  const png = Buffer.from(encodePng(rgba, HEAT_SIZE, HEAT_SIZE))
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  let offset = 8
  const data = []
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    if (png.subarray(offset + 4, offset + 8).toString() === 'IDAT')
      data.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  const rows = inflateSync(Buffer.concat(data))
  for (let y = 0; y < HEAT_SIZE; y++)
    assert.deepEqual(
      rows.subarray(y * (HEAT_SIZE * 4 + 1) + 1, (y + 1) * (HEAT_SIZE * 4 + 1)),
      Buffer.from(rgba.subarray(y * HEAT_SIZE * 4, (y + 1) * HEAT_SIZE * 4)),
    )
})

test('invalid gaps stay split and dateline routes do not cross the whole world', () => {
  const { prepareHeatRoutes } = loadTs('src/lib/path-heat-routes.ts')
  const data = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { id: 'one', type: 'running', dateTs: 1 },
        geometry: {
          type: 'LineString',
          coordinates: [
            [179, 0],
            [-179, 0],
            [NaN, NaN],
            [10, 0],
            [11, 0],
          ],
        },
      },
    ],
  }
  const prepared = prepareHeatRoutes(data)
  assert.equal(prepared.features.length, 2)
  assert.deepEqual(prepared.features[0].geometry.coordinates, [
    [179, 0],
    [181, 0],
  ])
  const index = geojsonvt(prepared, { maxZoom: 16, tolerance: 0, buffer: 64 })
  assert.equal(index.getTile(3, 2, 4), null)
})
