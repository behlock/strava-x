'use client'

import { CircleDot } from 'lucide-react'

import { useMapStyle } from '@/hooks/use-map-style'
import { Tooltip } from './tooltip'

export function MapStyleToggle() {
  const { style, setStyle } = useMapStyle()
  const isHeat = style === 'hotspots'

  return (
    <Tooltip text="map style">
      <button
        type="button"
        aria-label="Heat map"
        aria-pressed={isHeat}
        onClick={() => setStyle(isHeat ? 'routes' : 'hotspots')}
        className="mobile-touch-target flex size-8 shrink-0 items-center justify-center rounded-lg floating-control focus-ring md:size-[35px]"
      >
        <CircleDot
          className="size-4 transition-[fill] duration-150 motion-reduce:transition-none"
          fill={isHeat ? 'currentColor' : 'none'}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
    </Tooltip>
  )
}
