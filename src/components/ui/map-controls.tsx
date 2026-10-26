'use client'

import { Locate } from 'lucide-react'

import { Tooltip } from './tooltip'

const CONTROL_CLASS = 'flex size-11 items-center justify-center rounded-full floating-control focus-ring md:size-9'

interface LocateControlProps {
  onClick: () => void
}

/** Floating map control that recenters on the viewer's position. */
export function LocateControl({ onClick }: LocateControlProps) {
  return (
    <Tooltip text="my location" position="top" align="end">
      <button type="button" onClick={onClick} aria-label="Recenter on my location" className={CONTROL_CLASS}>
        <Locate className="size-4" />
      </button>
    </Tooltip>
  )
}
