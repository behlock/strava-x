import type { LineLayerSpecification } from 'mapbox-gl'

/** Identical neutral ink makes alpha compositing independent of route order. */
export function routePaint(isDark: boolean, highlighted: boolean): LineLayerSpecification['paint'] {
  return {
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
    // Avoid a flash of opaque history when changing selection or filters.
    'line-opacity-transition': { duration: 0 },
  }
}
