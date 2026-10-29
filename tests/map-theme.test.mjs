import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

test('paint-only themes preserve application layers and avoid repeatedly serializing the style', () => {
  const { applyMapTheme } = loadTs('src/lib/map-theme.ts')
  const layers = [
    { id: 'background', type: 'background' },
    { id: 'road', type: 'line', 'source-layer': 'road' },
    { id: 'custom', type: 'line', 'source-layer': 'custom' },
    { id: 'public-route', type: 'line', 'source-layer': 'routes' },
    { id: 'own-route', type: 'line' },
  ]
  const paint = new Map(),
    writes = []
  let styleReads = 0
  const map = {
    getStyle: () => {
      styleReads++
      return { layers }
    },
    getLayer: (id) => layers.find((layer) => layer.id === id),
    getPaintProperty: (id, key) => paint.get(`${id}:${key}`),
    setPaintProperty: (id, key, value) => {
      paint.set(`${id}:${key}`, value)
      writes.push(id)
    },
  }
  applyMapTheme(map, true)
  assert.equal(paint.has('custom:line-color'), false, 'preserve custom style colors')
  assert.equal(writes.includes('public-route'), false)
  assert.equal(writes.includes('own-route'), false)
  applyMapTheme(map, true)
  assert.equal(styleReads, 1)
  applyMapTheme(map, false, true)
  assert.equal(paint.get('background:background-color'), '#F5F5F5')
  assert.ok(paint.has('custom:line-color'), 'shared base style recolors non-road lines')
  assert.equal(styleReads, 2)
})
