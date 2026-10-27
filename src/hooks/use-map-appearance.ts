'use client'

import { useCallback } from 'react'
import { useLocalStorageItem, writeLocalStorage } from '@/hooks/use-local-storage'
import { config } from '@/lib/config'
import {
  COMPARISON_PALETTES,
  COMPARISON_RENDER_MODES,
  DEFAULT_PERSONAL_APPEARANCE,
  DEFAULT_COMPARISON_ICON,
  DEFAULT_COMPARISON_PALETTE,
  DEFAULT_COMPARISON_RENDER_MODE,
  type RouteAppearance,
  type ComparisonAppearance,
  type ComparisonIconId,
  type ComparisonPaletteId,
  type ComparisonRenderMode,
} from '@/lib/comparison-appearance'

function useRouteAppearance(
  scope: 'personal-map' | 'overlap',
  defaults: Pick<RouteAppearance, 'paletteId' | 'renderMode'>,
): RouteAppearance {
  const paletteKey = `strava-x:${scope}-palette:v2`
  const modeKey = `strava-x:${scope}-render-mode:v2`
  const palette = useLocalStorageItem(paletteKey)
  const mode = useLocalStorageItem(modeKey)
  const setPalette = useCallback((id: ComparisonPaletteId) => writeLocalStorage(paletteKey, id), [paletteKey])
  const setRenderMode = useCallback((id: ComparisonRenderMode) => writeLocalStorage(modeKey, id), [modeKey])
  return {
    paletteId:
      (config.MAP_STYLE_DEBUG && COMPARISON_PALETTES.find((candidate) => candidate.id === palette)?.id) ||
      defaults.paletteId,
    renderMode:
      (config.MAP_STYLE_DEBUG && COMPARISON_RENDER_MODES.find((candidate) => candidate.id === mode)?.id) ||
      defaults.renderMode,
    setPalette,
    setRenderMode,
  }
}

export function usePersonalMapAppearance(): RouteAppearance {
  return useRouteAppearance('personal-map', DEFAULT_PERSONAL_APPEARANCE)
}

const ICON_KEY = 'strava-x:overlap-icon:v2'
const setIcon = (id: ComparisonIconId) => writeLocalStorage(ICON_KEY, id)

export function useComparisonAppearance(): ComparisonAppearance {
  const appearance = useRouteAppearance('overlap', {
    paletteId: DEFAULT_COMPARISON_PALETTE,
    renderMode: DEFAULT_COMPARISON_RENDER_MODE,
  })
  const icon = useLocalStorageItem(ICON_KEY)
  return {
    ...appearance,
    iconId: config.MAP_STYLE_DEBUG && (icon === 'combine' || icon === 'layers') ? icon : DEFAULT_COMPARISON_ICON,
    setIcon,
  }
}
