'use client'

import dynamic from 'next/dynamic'

// Neither persisted tuning values nor the editor run in a production build.
const Tuner =
  process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DESIGN_TUNING !== 'false'
    ? dynamic(() => import('./design-tuner'), { ssr: false })
    : null

export function DesignTuning() {
  return Tuner ? <Tuner /> : null
}
