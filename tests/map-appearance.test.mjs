import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

for (const debug of [false, true])
  test(`legacy rendering preferences cannot change the default (debug=${debug})`, () => {
    const storage = new Map([
      ['strava-x:map-style:v1', 'hotspots'],
      ['strava-x:personal-map-render-mode:v2', 'hotspots'],
      ['strava-x:overlap-render-mode:v2', 'glow'],
    ])
    const hooks = loadTs('src/hooks/use-map-appearance.ts', {
      '@/lib/config': { config: { MAP_STYLE_DEBUG: debug } },
      '@/hooks/use-local-storage': {
        useLocalStorageItem: (key) => storage.get(key) ?? null,
        writeLocalStorage: (key, value) => storage.set(key, value),
      },
    })
    assert.equal('renderMode' in hooks.useComparisonAppearance(), false)
    assert.equal(hooks.useComparisonAppearance().paletteId, 'ink')
  })
