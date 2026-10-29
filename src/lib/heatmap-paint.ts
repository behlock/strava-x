import type { HeatmapLayerSpecification } from 'mapbox-gl'

const STONE = {
  light: ['#c0bbc6', '#aaa4a2', '#898b83', '#57565b'],
  dark: ['#514d5d', '#807e83', '#aaa99b', '#ddd6c8'],
} as const

export function heatmapColors(isDark: boolean) {
  return isDark ? STONE.dark : STONE.light
}

function rgba(color: string, opacity: number): string {
  const value = parseInt(color.slice(1), 16)
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${opacity})`
}

export function heatmapPaint(isDark: boolean, opacity = 0.8, color?: string): HeatmapLayerSpecification['paint'] {
  const colors = heatmapColors(isDark)
  return {
    'heatmap-weight': ['get', 'weight'],
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 5, 0.01, 12, 0.035, 16, 0.2],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 5, 5, 12, 12, 16, 20],
    'heatmap-opacity': opacity,
    'heatmap-opacity-transition': { duration: 0 },
    'heatmap-color': color
      ? [
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
        ]
      : [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          rgba(colors[0], 0),
          0.12,
          colors[0],
          0.35,
          colors[1],
          0.65,
          colors[2],
          1,
          colors[3],
        ],
  }
}
