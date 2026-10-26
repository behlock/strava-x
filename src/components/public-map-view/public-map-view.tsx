'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import type { Activity } from '@/models/activity'
import { MapView } from '@/components/map-view'
import { HEADER_LOGO_CLASS, HeaderBar, SetupPanel, Tooltip } from '@/components/ui'
import { loadPublishedMap } from '@/lib/published-map'

interface PublicMapViewProps {
  slug: string
  blobUrl: string
  displayName: string | null
}

function formatPublishedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase()
}

function PublicHeader({ displayName, publishedAt }: { displayName: string | null; publishedAt: string | null }) {
  const byline = displayName ? (
    <span className="truncate text-xs-compact tracking-wider opacity-60">— published by {displayName}</span>
  ) : null

  return (
    <HeaderBar
      logo={
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className={HEADER_LOGO_CLASS}>
            strava—x
          </Link>
          {byline && publishedAt ? (
            <Tooltip text={`updated ${formatPublishedAt(publishedAt)}`} align="start">
              {byline}
            </Tooltip>
          ) : (
            byline
          )}
        </div>
      }
    />
  )
}

/** Read-only view of a published map, loaded through the revocable sharing API. */
export function PublicMapView({ slug, blobUrl, displayName }: PublicMapViewProps) {
  const [activities, setActivities] = useState<Activity[] | null>(null)
  const [publishedAt, setPublishedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const payload = await loadPublishedMap(blobUrl)
        if (cancelled) return
        setPublishedAt(payload.updatedAt)
        setActivities(payload.activities)
      } catch (e) {
        if (cancelled) return
        console.error('[public-map-view] failed to load payload', e)
        setError("this map couldn't be loaded, refresh to try again")
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
          <h1 className="text-lg-compact font-medium tracking-tight">couldn&apos;t load /{slug}</h1>
          <p className="text-sm-compact text-panel-muted">{error}</p>
        </div>
      </main>
    )
  }

  return (
    <MapView
      activities={activities ?? []}
      loading={activities === null}
      header={<PublicHeader displayName={displayName} publishedAt={publishedAt} />}
      setupPanel={<SetupPanel />}
      mode="public"
    />
  )
}
