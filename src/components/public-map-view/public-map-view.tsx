'use client'

import { useStravaAuth } from '@/hooks/use-strava-auth'
import { useStravaProfile } from '@/hooks/use-strava-profile'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import type { Activity } from '@/models/activity'
import { MapView } from '@/components/map-view'
import { HEADER_LOGO_CLASS, HeaderBar, Pill, Tooltip } from '@/components/ui'
import { loadPublishedMap } from '@/lib/published-map'

interface PublicMapViewProps {
  slug: string
  blobUrl: string
}

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()
}

function PublicHeader({ slug, updatedAt }: { slug: string; updatedAt: string | null }) {
  const { isConnected, getAccessToken, disconnect } = useStravaAuth()
  const profile = useStravaProfile(isConnected, getAccessToken)
  const byline = (
    <Pill tabIndex={updatedAt ? 0 : undefined} className="max-w-[24vw] min-w-0 shrink py-1 focus-ring">
      <span className="truncate">/{slug}</span>
    </Pill>
  )
  return (
    <HeaderBar
      showProfileMenu={isConnected}
      profilePhotoUrl={profile?.photoUrl}
      onDisconnect={isConnected ? disconnect : undefined}
      logo={
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className={HEADER_LOGO_CLASS}>
            strava—x
          </Link>
          {updatedAt ? (
            <Tooltip text={`updated ${formatUpdatedAt(updatedAt)}`} align="start">
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
export function PublicMapView({ slug, blobUrl }: PublicMapViewProps) {
  const [activities, setActivities] = useState<Activity[] | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const payload = await loadPublishedMap(blobUrl)
        if (cancelled) return
        setUpdatedAt(payload.updatedAt)
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
      header={<PublicHeader slug={slug} updatedAt={updatedAt} />}
      mode="public"
    />
  )
}
