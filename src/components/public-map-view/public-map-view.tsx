'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Locate } from 'lucide-react'

import type { Activity } from '@/models/activity'
import type { ActivityMapRef } from '@/components/activity-map'
import { MapView } from '@/components/map-view'
import { HEADER_LOGO_CLASS, HeaderBar, HeaderChip, ThemeToggle } from '@/components/ui'
import { deserializeActivities, type SerializedActivity } from '@/lib/activities-serialize'
import { locateUser } from '@/lib/geolocation'

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

function PublicHeader({ displayName, onLocateClick }: { displayName: string | null; onLocateClick: () => void }) {
  return (
    <HeaderBar
      logo={
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className={HEADER_LOGO_CLASS}>
            strava—x
          </Link>
          {displayName && (
            <span className="truncate text-xs-compact tracking-wider opacity-60">— published by {displayName}</span>
          )}
        </div>
      }
    >
      <HeaderChip tooltip="my location" onClick={onLocateClick} aria-label="Recenter on my location">
        <Locate className="size-4" />
      </HeaderChip>
      <ThemeToggle />
    </HeaderBar>
  )
}

/** Read-only view of a published map, fetched straight from the blob CDN. */
export function PublicMapView({ slug, blobUrl, displayName }: PublicMapViewProps) {
  const [activities, setActivities] = useState<Activity[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<ActivityMapRef | null>(null)

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
      <main className="flex min-h-screen items-center justify-center bg-panel px-6">
        <div className="space-y-3 text-center">
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
      header={
        <PublicHeader
          displayName={displayName}
          onLocateClick={() => locateUser((position) => mapRef.current?.flyTo({ ...position, zoom: 12 }))}
        />
      }
      mode="public"
      externalMapRef={mapRef}
    />
  )
}
