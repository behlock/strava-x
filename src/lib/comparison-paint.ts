import type { LineLayerSpecification } from 'mapbox-gl'
import { INSTANT_LINE_TRANSITIONS } from './route-paint'

type Role = 'own' | 'other' | 'overlap'

/** Separate owner/viewer colours and a strong shared-route line. */
export function comparisonLinePaint(color: string, role: Role): LineLayerSpecification['paint'] {
  const overlap = role === 'overlap'
  return {
    ...INSTANT_LINE_TRANSITIONS,
    'line-color': color,
    'line-width': overlap
      ? ['interpolate', ['linear'], ['zoom'], 5, 1.5, 12, 2.5, 16, 3.5]
      : role === 'own'
        ? ['interpolate', ['linear'], ['zoom'], 5, 1.1, 10, 1.2, 13, 1.5, 16, 2.1, 19, 2.8]
        : ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 0.7, 13, 1, 16, 1.65, 19, 2.4],
    'line-opacity': overlap
      ? 1
      : role === 'own'
        ? 0.8
        : ['interpolate', ['linear'], ['zoom'], 5, 0.55, 12, 0.6, 16, 0.65],
    'line-dasharray': role === 'own' ? [3, 2] : [1, 0],
    'line-blur': 0,
  }
}
