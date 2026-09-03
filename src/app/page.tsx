'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

import type { ActivityMapRef } from '@/components/activity-map'
import { MapView } from '@/components/map-view'
import { Header } from '@/components/ui'
import { latestActivityStart, mergeActivities } from '@/lib/activities'
import { saveActivities } from '@/lib/activities-db'
import { serializeActivities } from '@/lib/activities-serialize'
import { config } from '@/lib/config'
import { fetchAllActivities } from '@/lib/strava'
import { usePersistedActivities } from '@/hooks/use-persisted-activities'
import { usePublish } from '@/hooks/use-publish'
import { useStravaAuth } from '@/hooks/use-strava-auth'
import { useWelcomePanel } from '@/hooks/use-welcome-panel'

const STRAVA_AVAILABLE = Boolean(config.STRAVA_CLIENT_ID)

const ExportModal = dynamic(() => import('@/components/export').then((mod) => mod.ExportModal), { ssr: false })
const PublishDialog = dynamic(() => import('@/components/publish').then((mod) => mod.PublishDialog), { ssr: false })
const WelcomePanel = dynamic(() => import('@/components/welcome').then((mod) => mod.WelcomePanel), { ssr: false })

const SYNC_ERRORS: Record<string, string> = {
  strava_unauthorized: 'strava authorization expired, reconnect to continue',
  strava_rate_limited: 'strava rate limit hit, try again in 15 minutes',
}

export default function HomePage() {
  const { activities, setActivities, isRestoring, clear: clearActivities } = usePersistedActivities()
  const { isConnected: stravaConnected, connect, disconnect, getAccessToken } = useStravaAuth()

  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const mapRef = useRef<ActivityMapRef | null>(null)

  const { open: welcomeOpen, dismiss: dismissWelcome } = useWelcomePanel({
    stravaConnected,
    hasActivities: activities.length > 0,
    isRestoring,
  })

  const { currentSlug, isPublishing, checkSlug, publish, unpublish, refreshCurrentSlug, forgetCurrentSlug } =
    usePublish({ getAccessToken, activities })

  // Rehydrate currentSlug from the server whenever the user becomes connected —
  // covers new devices and cleared localStorage.
  useEffect(() => {
    if (stravaConnected) void refreshCurrentSlug()
  }, [stravaConnected, refreshCurrentSlug])

  // --- Strava sync ------------------------------------------------------------

  const syncAbortRef = useRef<AbortController | null>(null)

  const syncFromStrava = useCallback(async () => {
    syncAbortRef.current?.abort()
    const controller = new AbortController()
    syncAbortRef.current = controller

    try {
      const token = await getAccessToken()
      if (controller.signal.aborted) return
      if (!token) {
        setSyncError('strava session expired, reconnect to continue')
        return
      }
      setIsSyncing(true)
      setSyncError(null)

      const fetched = await fetchAllActivities(token, {
        signal: controller.signal,
        onBatch: (batch) => {
          // Merge and persist page by page so an aborted sync keeps what it got.
          setActivities((current) => mergeActivities(current, batch))
          saveActivities(batch).catch(() => {
            setSyncError("activities loaded but couldn't be saved to browser storage")
          })
        },
      })
      if (!controller.signal.aborted && fetched === 0) {
        setSyncError('no strava activities found on this account')
      }
    } catch (err) {
      if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return
      console.error('Strava sync failed:', err)
      const code = err instanceof Error ? err.message : ''
      setSyncError(SYNC_ERRORS[code] ?? 'strava sync failed, try again')
      if (code === 'strava_unauthorized') disconnect()
    } finally {
      if (syncAbortRef.current === controller) syncAbortRef.current = null
      if (!controller.signal.aborted) setIsSyncing(false)
    }
  }, [getAccessToken, setActivities, disconnect])

  const abortSync = useCallback(() => {
    syncAbortRef.current?.abort()
    syncAbortRef.current = null
    setIsSyncing(false)
  }, [])

  const hasAutoSyncedRef = useRef(false)

  const handleDisconnect = useCallback(() => {
    abortSync()
    hasAutoSyncedRef.current = false
    disconnect()
    setSyncError(null)
    void clearActivities()
    // Disconnecting doesn't unpublish on the server — the user may reconnect
    // later. But we drop the local "currentSlug" so the UI doesn't keep
    // claiming they own a slug we can no longer verify.
    forgetCurrentSlug()
  }, [abortSync, disconnect, clearActivities, forgetCurrentSlug])

  // Sync once per connection: on page load with an existing session, and
  // after the OAuth callback lands the user back here.
  useEffect(() => {
    if (!stravaConnected || hasAutoSyncedRef.current) return
    hasAutoSyncedRef.current = true
    void syncFromStrava()
  }, [stravaConnected, syncFromStrava])

  useEffect(() => {
    return () => syncAbortRef.current?.abort()
  }, [])

  // --- Header / overlays ------------------------------------------------------

  const hasActivities = activities.length > 0 || isRestoring

  // Rough size of the publish payload so the dialog can warn before upload.
  const estimatedSizeBytes = useMemo(
    () => (publishOpen ? new Blob([JSON.stringify(serializeActivities(activities))]).size : 0),
    [publishOpen, activities],
  )

  const flyToLatestActivity = () => {
    const start = latestActivityStart(activities)
    if (start) mapRef.current?.flyTo({ ...start, zoom: 12 })
  }

  const header = (
    <Header
      onLogoClick={flyToLatestActivity}
      onExportClick={() => setExportOpen(true)}
      onPublishClick={() => setPublishOpen(true)}
      hasActivities={hasActivities}
      stravaAvailable={STRAVA_AVAILABLE}
      stravaConnected={stravaConnected}
      isStravaSyncing={isSyncing}
      stravaError={syncError}
      onStravaConnect={connect}
      onStravaDisconnect={handleDisconnect}
      onStravaAbortSync={abortSync}
    />
  )

  return (
    <MapView
      activities={activities}
      loading={isSyncing}
      header={header}
      externalMapRef={mapRef}
      overlays={
        <>
          <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} mapRef={mapRef} />
          <PublishDialog
            open={publishOpen}
            onClose={() => setPublishOpen(false)}
            currentSlug={currentSlug}
            isPublishing={isPublishing}
            estimatedSizeBytes={estimatedSizeBytes}
            publish={publish}
            unpublish={unpublish}
            checkSlug={checkSlug}
          />
          <WelcomePanel open={welcomeOpen} onDismiss={dismissWelcome} onConnect={connect} />
        </>
      }
    />
  )
}
