import type { LineLayerSpecification } from 'mapbox-gl'

export const INSTANT_LINE_TRANSITIONS = {
  'line-color-transition': { duration: 0 },
  'line-width-transition': { duration: 0 },
  'line-opacity-transition': { duration: 0 },
  'line-blur-transition': { duration: 0 },
} as const

/** Identical neutral ink makes alpha compositing independent of route order. */
export function routePaint(isDark: boolean, highlighted: boolean): LineLayerSpecification['paint'] {
  return {
    ...INSTANT_LINE_TRANSITIONS,
    'line-color': isDark ? '#C2C2C2' : '#555555',
    'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 0.7, 13, 1, 16, 1.65, 19, 2.4],
    'line-opacity': [
      'interpolate',
      ['linear'],
      ['zoom'],
      5,
      highlighted ? 0.035 : 0.7,
      12,
      highlighted ? 0.055 : 0.7,
      16,
      highlighted ? 0.08 : 0.8,
    ],
  }
}
