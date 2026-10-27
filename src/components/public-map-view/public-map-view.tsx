'use client'

import { useStravaAuth, type UseStravaAuth } from '@/hooks/use-strava-auth'
import { useCommonRoutes } from '@/hooks/use-common-routes'
import { useComparisonAppearance } from '@/hooks/use-map-appearance'
import { useStravaProfile } from '@/hooks/use-strava-profile'
import Link from 'next/link'
import { type ReactNode, useEffect, useState } from 'react'

import type { Activity } from '@/models/activity'
import { MapView } from '@/components/map-view'
import { HEADER_LOGO_CLASS, HeaderBar, Tooltip } from '@/components/ui'
import { loadPublishedMap } from '@/lib/published-map'
import { CommonRoutesToggle } from '@/components/ui/map-appearance-controls'

interface PublicMapViewProps {
  slug: string
  blobUrl: string
}

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()
}

function PublicHeader({
  slug,
  updatedAt,
  auth,
  children,
}: {
  slug: string
  updatedAt: string | null
  auth: UseStravaAuth
  children?: ReactNode
}) {
  const { isConnected, getAccessToken, disconnect } = auth
  const profile = useStravaProfile(isConnected, getAccessToken)
  const byline = (
    <span
      tabIndex={updatedAt ? 0 : undefined}
      className="inline-flex h-7 max-w-[24vw] min-w-0 items-center rounded-lg px-2 text-xs-compact focus-ring-inset"
    >
      <span className="truncate">/{slug}</span>
    </span>
  )
  return (
    <HeaderBar
      showProfileMenu={isConnected}
      profilePhotoUrl={profile?.photoUrl}
      onDisconnect={isConnected ? disconnect : undefined}
      logo={
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/" className={HEADER_LOGO_CLASS}>
            strava—x
          </Link>
          <div className="flex min-w-0 items-center overflow-hidden rounded-lg border border-panel-border bg-foreground/5">
            {updatedAt ? (
              <Tooltip text={`updated ${formatUpdatedAt(updatedAt)}`} align="start">
                {byline}
              </Tooltip>
            ) : (
              byline
            )}
            {children}
          </div>
        </div>
      }
    />
  )
}

function PublicMapCanvas({
  slug,
  updatedAt,
  activities,
  auth,
}: {
  slug: string
  updatedAt: string | null
  activities: Activity[] | null
  auth: UseStravaAuth
}) {
  const comparison = useCommonRoutes(activities, auth.resolveAccessToken)
  const appearance = useComparisonAppearance()
  return (
    <MapView
      activities={activities ?? []}
      loading={activities === null}
      header={
        <PublicHeader slug={slug} updatedAt={updatedAt} auth={auth}>
          {auth.isConnected && (
            <CommonRoutesToggle
              iconId={appearance.iconId}
              enabled={comparison.enabled}
              loading={comparison.state?.status === 'loading'}
              disabled={!activities?.length}
              onToggle={comparison.toggle}
            />
          )}
        </PublicHeader>
      }
      commonRoutes={comparison.state}
      comparisonAppearance={appearance}
      onComparisonRetry={comparison.retry}
      mode="public"
    />
  )
}

/** Read-only view of a published map, loaded through the revocable sharing API. */
export function PublicMapView({ slug, blobUrl }: PublicMapViewProps) {
  return <LoadedPublicMap key={blobUrl} slug={slug} blobUrl={blobUrl} />
}

function LoadedPublicMap({ slug, blobUrl }: PublicMapViewProps) {
  const auth = useStravaAuth()
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
    <PublicMapCanvas
      key={auth.isConnected ? 'connected' : 'guest'}
      slug={slug}
      updatedAt={updatedAt}
      activities={activities}
      auth={auth}
    />
  )
}
