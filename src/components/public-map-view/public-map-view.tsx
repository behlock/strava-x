'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

import { MapView } from '@/components/map-view'
import { cn } from '@/lib/utils'
import { useMounted } from '@/hooks/use-mounted'
import { Activity } from '@/models/activity'
import { deserializeActivities, SerializedActivity } from '@/lib/activities-serialize'

interface PublicMapViewProps {
  slug: string
  blobUrl: string
  displayName: string | null
}

interface PublishedPayload {
  version: number
  publishedAt?: string
  displayName?: string | null
  activities: SerializedActivity[]
}

const SUPPORTED_PAYLOAD_VERSION = 1

const CHIP_TEXT =
  'inline-flex items-center justify-center text-xs-compact tracking-wider hover:bg-foreground/5 transition-colors border border-transparent hover:border-panel-border rounded-sm whitespace-nowrap min-h-[44px] px-3 md:min-h-0 md:h-8 md:px-2'
const CHIP_ICON =
  'inline-flex items-center justify-center text-xs-compact tracking-wider hover:bg-foreground/5 transition-colors border border-transparent hover:border-panel-border rounded-sm whitespace-nowrap min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:h-8 md:w-8'

function PublicHeader({ displayName, onLogoClick }: { displayName: string | null; onLogoClick: () => void }) {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()
  const isDark = mounted && theme === 'dark'

  return (
    <header
      className={cn('flex items-center justify-between px-4 py-3 bg-panel/90 panel-blur border-b border-panel-border')}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/" className="text-base-compact font-medium tracking-tight hover:opacity-70 transition-opacity">
          strava—x
        </Link>
        {displayName ? (
          <span className="text-xs-compact tracking-wider opacity-60 truncate">— published by {displayName}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onLogoClick} className={CHIP_TEXT} aria-label="Fly to latest activity">
          [⤢]<span className="hidden md:inline">—latest</span>
        </button>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          disabled={!mounted}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className={CHIP_ICON}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  )
}

export function PublicMapView({ slug, blobUrl, displayName }: PublicMapViewProps) {
  const [activities, setActivities] = useState<Activity[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(blobUrl, { cache: 'force-cache' })
        if (!res.ok) throw new Error(`fetch_failed_${res.status}`)
        const payload = (await res.json()) as PublishedPayload
        if (cancelled) return
        if (!Array.isArray(payload.activities)) throw new Error('malformed_payload')
        if (payload.version !== SUPPORTED_PAYLOAD_VERSION) {
          console.warn('[public-map-view] unknown payload version', payload.version)
        }
        setActivities(deserializeActivities(payload.activities))
      } catch (e) {
        if (cancelled) return
        console.error('[public-map-view] failed to load payload', e)
        setError('Failed to load this map. Please refresh.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [blobUrl])

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-panel px-6">
        <div className="text-center space-y-3">
          <h1 className="text-lg font-medium tracking-tight">Couldn&apos;t load /{slug}</h1>
          <p className="text-sm opacity-60">{error}</p>
        </div>
      </main>
    )
  }

  return (
    <MapView
      activities={activities ?? []}
      loading={activities === null}
      header={({ flyToLatestActivity }) => <PublicHeader displayName={displayName} onLogoClick={flyToLatestActivity} />}
    />
  )
}
