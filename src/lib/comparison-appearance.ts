interface ComparisonColors {
  own: string
  other: string
  overlap: string
}

export const COMPARISON_PALETTES = [
  {
    id: 'dusk',
    light: { own: '#ae713c', other: '#717171', overlap: '#775299' },
    dark: { own: '#c58b5a', other: '#929292', overlap: '#b39acc' },
  },
  {
    id: 'ember',
    light: { own: '#577c9d', other: '#717171', overlap: '#bc602f' },
    dark: { own: '#759bb8', other: '#929292', overlap: '#db9162' },
  },
  {
    id: 'ink',
    light: { own: '#7e858d', other: '#648399', overlap: '#665a9c' },
    dark: { own: '#969ca2', other: '#688aa4', overlap: '#a99bce' },
  },
  {
    id: 'clay',
    light: { own: '#7d843f', other: '#717171', overlap: '#a45d4e' },
    dark: { own: '#a1a66c', other: '#929292', overlap: '#ca907d' },
  },
  {
    id: 'berry',
    light: { own: '#637b98', other: '#77716b', overlap: '#a44e78' },
    dark: { own: '#8398b2', other: '#9a9289', overlap: '#c67f9f' },
  },
  {
    id: 'amber',
    light: { own: '#83709d', other: '#717171', overlap: '#a87a23' },
    dark: { own: '#a08bb9', other: '#929292', overlap: '#c6a258' },
  },
  {
    id: 'indigo',
    light: { own: '#b4796b', other: '#71818a', overlap: '#5368aa' },
    dark: { own: '#ca9b8e', other: '#889ba5', overlap: '#8e9acb' },
  },
  {
    id: 'copper',
    light: { own: '#55899b', other: '#717171', overlap: '#a16b43' },
    dark: { own: '#79a3b3', other: '#929292', overlap: '#c5956b' },
  },
  {
    id: 'forest',
    light: { own: '#75839b', other: '#8c7d70', overlap: '#537446' },
    dark: { own: '#91a0b5', other: '#a59585', overlap: '#8ca77c' },
  },
  {
    id: 'graphite',
    light: { own: '#707070', other: '#909090', overlap: '#303030' },
    dark: { own: '#9a9a9a', other: '#777777', overlap: '#ababab' },
  },
] as const satisfies readonly { id: string; light: ComparisonColors; dark: ComparisonColors }[]

export type ComparisonPaletteId = (typeof COMPARISON_PALETTES)[number]['id']
export type ComparisonIconId = 'layers' | 'combine' | 'scan'
export const DEFAULT_COMPARISON_ICON: ComparisonIconId = 'scan'
export const DEFAULT_COMPARISON_PALETTE: ComparisonPaletteId = 'ink'
export const COMPARISON_RENDER_MODES = [
  { id: 'routes', description: 'crisp routes and overlap' },
  { id: 'density', description: 'repeated traces build intensity' },
  { id: 'glow', description: 'route density with a soft halo' },
  { id: 'hotspots', description: 'activity concentrations around routes' },
] as const
export type ComparisonRenderMode = (typeof COMPARISON_RENDER_MODES)[number]['id']
export const DEFAULT_COMPARISON_RENDER_MODE: ComparisonRenderMode = 'glow'

export const DEFAULT_PERSONAL_APPEARANCE = {
  paletteId: 'graphite',
  renderMode: 'glow',
} as const

export interface RouteAppearance {
  paletteId: ComparisonPaletteId
  renderMode: ComparisonRenderMode
  setPalette: (id: ComparisonPaletteId) => void
  setRenderMode: (mode: ComparisonRenderMode) => void
}

export interface ComparisonAppearance extends RouteAppearance {
  iconId: ComparisonIconId
  setIcon: (id: ComparisonIconId) => void
}

export function comparisonColors(paletteId: string, dark: boolean): ComparisonColors {
  const palette =
    COMPARISON_PALETTES.find((candidate) => candidate.id === paletteId) ??
    COMPARISON_PALETTES.find((candidate) => candidate.id === DEFAULT_COMPARISON_PALETTE)!
  return dark ? palette.dark : palette.light
}
