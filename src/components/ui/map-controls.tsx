'use client'

import { LoaderCircle, Locate } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { type LatLng, locateUser } from '@/lib/geolocation'
import { Tooltip } from './tooltip'

const CONTROL_CLASS = 'flex size-11 items-center justify-center rounded-full floating-control focus-ring md:size-9'

interface LocateControlProps {
  onLocate: (position: LatLng) => void
}

export function LocateControl({ onLocate }: LocateControlProps) {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<object | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!error) return
    const dismissOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setError(null)
    }
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setError(null)
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    document.addEventListener('keydown', dismissOnEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true)
      document.removeEventListener('keydown', dismissOnEscape)
    }
  }, [error])

  useEffect(
    () => () => {
      requestRef.current = null
    },
    [],
  )

  const handleLocate = async () => {
    if (error) {
      setError(null)
      return
    }
    if (requestRef.current) return
    const request = {}
    requestRef.current = request
    setLocating(true)
    setError(null)
    try {
      const position = await locateUser()
      if (requestRef.current === request) onLocate(position)
    } catch (error) {
      if (requestRef.current === request) {
        setError(error instanceof Error ? error.message : 'could not find your location. try again')
      }
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null
        setLocating(false)
      }
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div role="status" aria-live="polite">
        {error ? (
          <p className="absolute right-0 bottom-full mb-2 w-64 max-w-[calc(100vw-32px)] rounded-lg border border-panel-border bg-panel p-3 text-xs-compact text-foreground shadow-sm">
            {error}
          </p>
        ) : locating ? (
          <span className="sr-only">finding your location</span>
        ) : null}
      </div>
      <Tooltip text={locating ? 'finding your location' : 'my location'} position="top" align="end" disabled={!!error}>
        <button
          type="button"
          onClick={handleLocate}
          disabled={locating}
          aria-busy={locating}
          aria-label={error ? 'Dismiss location message' : 'Recenter on my location'}
          className={CONTROL_CLASS}
        >
          {locating ? <LoaderCircle className="size-4 motion-safe:animate-spin" /> : <Locate className="size-4" />}
        </button>
      </Tooltip>
    </div>
  )
}
