'use client'

import { useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useStravaAuth } from '@/hooks/use-strava-auth'
import { usePublish } from '@/hooks/use-publish'

/** Resolve ownership before exploring, including on a cold page load. */
export function ExploreButton({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname()
  const { isConnected, getAccessToken } = useStravaAuth()
  const { refreshCurrentSlug } = usePublish({ getAccessToken })
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function explore() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(false)
    try {
      const params = new URLSearchParams({ from: pathname.slice(1) })
      if (isConnected) {
        const share = await refreshCurrentSlug()
        // Never guess ownership when verification is unavailable.
        if (!share) throw new Error('ownership_unavailable')
        if (share.slug) params.set('own', share.slug)
      }
      // Native navigation guarantees a fresh random selection on every click.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/explore?${params}`)
    } catch {
      setError(true)
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className={className}
        onClick={explore}
        disabled={busy}
        aria-busy={busy}
        aria-label="Explore a random map"
      >
        {children}
      </button>
      {error && (
        <span
          role="status"
          className="absolute top-full right-0 z-50 mt-2 w-52 rounded-lg border border-panel-border bg-panel p-3 text-xs-compact"
        >
          couldn&apos;t explore right now. please try again.
        </span>
      )}
    </span>
  )
}
