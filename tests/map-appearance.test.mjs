import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

function appearances(debug, initial = {}, storage = new Map(Object.entries(initial))) {
  const mocks = {
    react: { useCallback: (callback) => callback },
    '@/lib/config': { config: { MAP_STYLE_DEBUG: debug } },
    '@/hooks/use-local-storage': {
      useLocalStorageItem: (key) => storage.get(key) ?? null,
      writeLocalStorage: (key, value) => storage.set(key, value),
    },
  }
  const hooks = loadTs('src/hooks/use-map-appearance.ts', mocks)
  return {
    personal: hooks.usePersonalMapAppearance,
    comparison: hooks.useComparisonAppearance,
    picker: loadTs('src/hooks/use-map-style.ts', mocks).useMapStyle,
  }
}

test('chosen defaults apply with debug off, even after saved experiments', () => {
  const { personal, comparison } = appearances(false)
  personal().setPalette('ember')
  personal().setRenderMode('hotspots')
  comparison().setPalette('clay')
  comparison().setRenderMode('density')
  comparison().setIcon('layers')
  assert.equal(personal().paletteId, 'graphite')
  assert.equal(personal().renderMode, 'routes')
  assert.equal(comparison().paletteId, 'ink')
  assert.equal(comparison().renderMode, 'routes')
  assert.equal(comparison().iconId, 'scan')
})

test('debug starts with chosen defaults, then keeps personal and comparison experiments independent', () => {
  const { personal, comparison } = appearances(true, {
    'strava-x:personal-map-palette': 'ember',
    'strava-x:personal-map-render-mode': 'routes',
    'strava-x:overlap-palette': 'graphite',
    'strava-x:overlap-render-mode': 'routes',
  })
  assert.equal(personal().paletteId, 'graphite')
  assert.equal(personal().renderMode, 'routes')
  assert.equal(comparison().paletteId, 'ink')
  assert.equal(comparison().renderMode, 'routes')
  personal().setPalette('dusk')
  personal().setRenderMode('hotspots')
  assert.equal(comparison().paletteId, 'ink')
  assert.equal(comparison().renderMode, 'routes')
  comparison().setPalette('copper')
  comparison().setRenderMode('density')
  assert.equal(comparison().paletteId, 'copper')
  assert.equal(comparison().renderMode, 'density')
  assert.equal(personal().paletteId, 'dusk')
  assert.equal(personal().renderMode, 'hotspots')
})

test('invalid styles fall back to classic and choosing a style clears an old debug mode', () => {
  assert.equal(appearances(false, { 'strava-x:map-style:v1': 'invalid' }).personal().renderMode, 'routes')
  const { personal, comparison, picker } = appearances(true, {
    'strava-x:personal-map-render-mode:v2': 'density',
    'strava-x:overlap-render-mode:v2': 'density',
  })
  assert.equal(personal().renderMode, 'density')
  picker().setStyle('hotspots')
  assert.equal(personal().renderMode, 'hotspots')
  assert.equal(comparison().renderMode, 'hotspots')
})

test('each available style applies to both maps and preserves the overlap palette', () => {
  const { personal, comparison, picker } = appearances(false)
  for (const id of ['routes', 'hotspots']) {
    picker().setStyle(id)
    assert.equal(personal().renderMode, id)
    assert.equal(comparison().renderMode, id)
    assert.equal(comparison().paletteId, 'ink')
  }
})

test('removed experimental styles fall back to classic', () => {
  for (const id of ['glow', 'density', 'hexagons', 'dots', 'activity', 'recency', 'outline', 'direction']) {
    assert.equal(appearances(false, { 'strava-x:map-style:v1': id }).personal().renderMode, 'routes')
  }
})

test('map style persists across page remounts and changes made on another map', () => {
  const storage = new Map()
  const ownPage = appearances(false, {}, storage)
  ownPage.picker().setStyle('hotspots')
  const pierrePage = appearances(false, {}, storage)
  assert.equal(pierrePage.picker().style, 'hotspots')
  assert.equal(pierrePage.personal().renderMode, 'hotspots')
  assert.equal(pierrePage.comparison().renderMode, 'hotspots')
  pierrePage.picker().setStyle('routes')
  const returnedOwnPage = appearances(false, {}, storage)
  assert.equal(returnedOwnPage.picker().style, 'routes')
  assert.equal(returnedOwnPage.personal().renderMode, 'routes')
})
