'use client'

import { useLocalStorageItem, writeLocalStorage } from '@/hooks/use-local-storage'

type MapStyle = 'routes' | 'hotspots'

const STYLE_KEY = 'strava-x:map-style:v1'
const setStyle = (style: MapStyle) => {
  writeLocalStorage(STYLE_KEY, style)
  writeLocalStorage('strava-x:personal-map-render-mode:v2', null)
  writeLocalStorage('strava-x:overlap-render-mode:v2', null)
}

export function useMapStyle() {
  const stored = useLocalStorageItem(STYLE_KEY)
  const style: MapStyle = stored === 'hotspots' ? 'hotspots' : 'routes'
  return { style, setStyle }
}
