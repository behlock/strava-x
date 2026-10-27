import type { HeatmapLayerSpecification, LineLayerSpecification } from 'mapbox-gl'
import { comparisonColors, type ComparisonPaletteId, type ComparisonRenderMode } from './comparison-appearance'
import { routePaint } from './route-paint'

type Role = 'own' | 'other' | 'overlap'

export function personalRouteColor(paletteId: ComparisonPaletteId, isDark: boolean): string {
  return paletteId === 'graphite' ? (isDark ? '#C2C2C2' : '#555555') : comparisonColors(paletteId, isDark).own
}

/** Keep the original personal view as the baseline, including activity highlighting. */
export function personalRoutePaint(
  isDark: boolean,
  color: string,
  mode: ComparisonRenderMode,
  highlighted: boolean,
): LineLayerSpecification['paint'] {
  if (mode === 'routes')
    return { ...routePaint(isDark, highlighted), 'line-color': color, 'line-blur': 0, 'line-dasharray': [1, 0] }
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
    'line-opacity-transition': { duration: 0 },
  }
}

export function comparisonGlowPaint(color: string): LineLayerSpecification['paint'] {
  return {
    'line-color': color,
    'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 12, 7, 16, 12],
    'line-blur': ['interpolate', ['linear'], ['zoom'], 5, 2, 12, 5, 16, 8],
    'line-opacity': 0.08,
  }
}

function rgba(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16)
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`
}

export function comparisonHeatmapPaint(color: string): HeatmapLayerSpecification['paint'] {
  return {
    'heatmap-weight': ['get', 'weight'],
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 5, 0.04, 12, 0.12, 16, 0.6],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 5, 4, 12, 12, 16, 24],
    'heatmap-opacity': 0.85,
    'heatmap-color': [
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0,
      rgba(color, 0),
      0.15,
      rgba(color, 0.15),
      0.4,
      rgba(color, 0.45),
      0.7,
      rgba(color, 0.8),
      1,
      color,
    ],
  }
}
