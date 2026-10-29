import type { LineLayerSpecification } from 'mapbox-gl'
import { routePaint, INSTANT_LINE_TRANSITIONS } from './route-paint'
import { comparisonColors, type ComparisonPaletteId, type ComparisonRenderMode } from './comparison-appearance'

type Role = 'own' | 'other' | 'overlap'

export function personalRouteColor(paletteId: ComparisonPaletteId, isDark: boolean): string {
  return paletteId === 'graphite' ? (isDark ? '#C2C2C2' : '#555555') : comparisonColors(paletteId, isDark).own
}

export function personalRoutePaint(
  isDark: boolean,
  color: string,
  mode: ComparisonRenderMode,
  highlighted: boolean,
): LineLayerSpecification['paint'] {
  if (mode === 'routes' || mode === 'hotspots') {
    return {
      ...routePaint(isDark, highlighted),
      'line-color': color,
      'line-blur': 0,
      'line-dasharray': [1, 0],
      ...(mode === 'hotspots' ? { 'line-opacity': highlighted ? 0.015 : 0.06 } : {}),
    }
  }
  return { ...comparisonLinePaint(color, 'own', mode), ...(highlighted ? { 'line-opacity': 0.035 } : {}) }
}

/** Low-alpha traces accumulate naturally where multiple activities follow a route. */
export function comparisonLinePaint(
  color: string,
  role: Role,
  mode: ComparisonRenderMode,
): LineLayerSpecification['paint'] {
  const overlap = role === 'overlap'
  if (mode === 'routes')
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
  const hotspots = mode === 'hotspots'
  return {
    ...INSTANT_LINE_TRANSITIONS,
    'line-color': color,
    'line-width': [
      'interpolate',
      ['linear'],
      ['zoom'],
      5,
      overlap ? 1 : 0.6,
      12,
      overlap ? 2.4 : 1.4,
      16,
      overlap ? 3.6 : 2.4,
    ],
    'line-opacity': hotspots ? (overlap ? 0.2 : 0.12) : overlap ? 0.16 : 0.1,
    'line-blur': mode === 'glow' ? 0.8 : 0,
    'line-dasharray': [1, 0],
  }
}

export function comparisonGlowPaint(color: string): LineLayerSpecification['paint'] {
  return {
    ...INSTANT_LINE_TRANSITIONS,
    'line-color': color,
    'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 12, 7, 16, 12],
    'line-blur': ['interpolate', ['linear'], ['zoom'], 5, 2, 12, 5, 16, 8],
    'line-opacity': 0.08,
  }
}
