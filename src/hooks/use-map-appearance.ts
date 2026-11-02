'use client'

import { useLocalStorageItem, writeLocalStorage } from '@/hooks/use-local-storage'
import { config } from '@/lib/config'
import {
  COMPARISON_PALETTES,
  DEFAULT_COMPARISON_ICON,
  DEFAULT_COMPARISON_PALETTE,
  type ComparisonAppearance,
  type ComparisonIconId,
  type ComparisonPaletteId,
} from '@/lib/comparison-appearance'

const PALETTE_KEY = 'strava-x:overlap-palette:v2'
const setPalette = (id: ComparisonPaletteId) => writeLocalStorage(PALETTE_KEY, id)

const ICON_KEY = 'strava-x:overlap-icon:v2'
const setIcon = (id: ComparisonIconId) => writeLocalStorage(ICON_KEY, id)

export function useComparisonAppearance(): ComparisonAppearance {
  const palette = useLocalStorageItem(PALETTE_KEY)
  const icon = useLocalStorageItem(ICON_KEY)
  return {
    paletteId:
      (config.MAP_STYLE_DEBUG && COMPARISON_PALETTES.find((candidate) => candidate.id === palette)?.id) ||
      DEFAULT_COMPARISON_PALETTE,
    setPalette,
    iconId: config.MAP_STYLE_DEBUG && (icon === 'combine' || icon === 'layers') ? icon : DEFAULT_COMPARISON_ICON,
    setIcon,
  }
}
