import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

function appearances(debug, initial = {}) {
  const storage = new Map(Object.entries(initial))
  const mocks = {
    react: { useCallback: (callback) => callback },
    '@/lib/config': { config: { MAP_STYLE_DEBUG: debug } },
    '@/hooks/use-local-storage': {
      useLocalStorageItem: (key) => storage.get(key) ?? null,
      writeLocalStorage: (key, value) => storage.set(key, value),
    },
  }
  const hooks = loadTs('src/hooks/use-map-appearance.ts', mocks)
  return { personal: hooks.usePersonalMapAppearance, comparison: hooks.useComparisonAppearance }
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
  assert.equal(comparison().renderMode, 'glow')
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
  assert.equal(comparison().renderMode, 'glow')
  personal().setPalette('dusk')
  personal().setRenderMode('hotspots')
  assert.equal(comparison().paletteId, 'ink')
  assert.equal(comparison().renderMode, 'glow')
  comparison().setPalette('copper')
  comparison().setRenderMode('density')
  assert.equal(comparison().paletteId, 'copper')
  assert.equal(comparison().renderMode, 'density')
  assert.equal(personal().paletteId, 'dusk')
  assert.equal(personal().renderMode, 'hotspots')
})
