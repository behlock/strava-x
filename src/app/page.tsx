'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

import type { ActivityMapRef } from '@/components/activity-map'
import { MapView } from '@/components/map-view'
import { Header, SetupPanel } from '@/components/ui'
import { latestActivityStart, mergeActivities } from '@/lib/activities'
import { saveActivities } from '@/lib/activities-db'
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
const SESSION_EXPIRED_ERROR = 'strava session expired, reconnect to continue'
const STRAVA_UNREACHABLE_ERROR = 'strava is unreachable, try again'
// One automatic retry after a transient token failure.
const TRANSIENT_RETRY_DELAY_MS = 5000

export default function HomePage() {
  const { activities, setActivities, isRestoring, clear: clearActivities } = usePersistedActivities()
  const { isConnected: stravaConnected, connect, disconnect, getAccessToken, resolveAccessToken } = useStravaAuth()

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

  const {
    currentSlug,
    isPublishing,
    estimatePayloadSize,
    checkSlug,
    publish,
    unpublish,
    refreshCurrentSlug,
    forgetCurrentSlug,
  } = usePublish({ getAccessToken, activities })

  // Rehydrate currentSlug from the server whenever the user becomes connected —
  // covers new devices and cleared localStorage.
  useEffect(() => {
    if (stravaConnected) void refreshCurrentSlug()
  }, [stravaConnected, refreshCurrentSlug])

  // --- Strava sync ------------------------------------------------------------

  const syncAbortRef = useRef<AbortController | null>(null)
  // IndexedDB writes started by `onBatch` that haven't settled; a disconnect
  // waits for them before wiping the store.
  const pendingSavesRef = useRef(new Set<Promise<void>>())
  // Bumped by disconnect so callbacks from a sync that already finished (a
  // late save failure, say) can't report errors into the next session.
  const sessionGenerationRef = useRef(0)
  const hasAutoSyncedRef = useRef(false)
  const hasRetriedRef = useRef(false)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [autoSyncAttempt, setAutoSyncAttempt] = useState(0)

  const syncFromStrava = useCallback(async () => {
    syncAbortRef.current?.abort()
    const controller = new AbortController()
    syncAbortRef.current = controller
    const { signal } = controller
    const generation = sessionGenerationRef.current
    const isLive = () => !signal.aborted && generation === sessionGenerationRef.current

    try {
      const auth = await resolveAccessToken()
      if (signal.aborted) return
      if (auth.status === 'unauthenticated') {
        setSyncError(SESSION_EXPIRED_ERROR)
        return
      }
      if (auth.status === 'unavailable') {
        // Strava or the network is down, not the session. Leave the sync
        // re-runnable: once automatically after a short delay, and again on
        // the next connection change.
        setSyncError(STRAVA_UNREACHABLE_ERROR)
        hasAutoSyncedRef.current = false
        if (!hasRetriedRef.current) {
          hasRetriedRef.current = true
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null
            setAutoSyncAttempt((attempt) => attempt + 1)
          }, TRANSIENT_RETRY_DELAY_MS)
        }
        return
      }
      setIsSyncing(true)
      setSyncError(null)

      const fetched = await fetchAllActivities(auth.accessToken, {
        signal,
        onBatch: (batch) => {
          // Merge and persist page by page so an aborted sync keeps what it got.
          setActivities((current) => mergeActivities(current, batch))
          const save: Promise<void> = saveActivities(batch)
            .catch(() => {
              if (isLive()) setSyncError("activities loaded but couldn't be saved to browser storage")
            })
            .finally(() => {
              pendingSavesRef.current.delete(save)
            })
          pendingSavesRef.current.add(save)
        },
      })
      if (!signal.aborted && fetched === 0) {
        setSyncError('no strava activities found on this account')
      }
    } catch (err) {
      if (signal.aborted || (err as Error)?.name === 'AbortError') return
      console.error('Strava sync failed:', err)
      const code = err instanceof Error ? err.message : ''
      setSyncError(SYNC_ERRORS[code] ?? 'strava sync failed, try again')
      if (code === 'strava_unauthorized') disconnect()
    } finally {
      if (syncAbortRef.current === controller) syncAbortRef.current = null
      if (!signal.aborted) setIsSyncing(false)
    }
  }, [resolveAccessToken, setActivities, disconnect])

  const abortSync = useCallback(() => {
    syncAbortRef.current?.abort()
    syncAbortRef.current = null
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    setIsSyncing(false)
  }, [])

  const handleDisconnect = useCallback(() => {
    abortSync()
    sessionGenerationRef.current++
    hasAutoSyncedRef.current = false
    hasRetriedRef.current = false
    disconnect()
    setSyncError(null)
    // State empties right away; the store is wiped only once the page writes
    // still in flight have settled, so none of them can land after the wipe.
    void clearActivities(Promise.allSettled([...pendingSavesRef.current]))
    // Disconnecting doesn't unpublish on the server — the user may reconnect
    // later. But we drop the local "currentSlug" so the UI doesn't keep
    // claiming they own a slug we can no longer verify.
    forgetCurrentSlug()
  }, [abortSync, disconnect, clearActivities, forgetCurrentSlug])

  // Sync once per connection: on page load with an existing session, and
  // after the OAuth callback lands the user back here. `autoSyncAttempt`
  // re-runs it after a transient failure.
  useEffect(() => {
    if (!stravaConnected || hasAutoSyncedRef.current) return
    hasAutoSyncedRef.current = true
    void syncFromStrava()
  }, [stravaConnected, autoSyncAttempt, syncFromStrava])

  useEffect(() => {
    return () => {
      syncAbortRef.current?.abort()
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      // Strict Mode runs this cleanup once right after mount and then re-runs
      // the effects: the sync it just aborted has to be allowed to start
      // again, or development never syncs at all.
      hasAutoSyncedRef.current = false
    }
  }, [])

  // --- Header / overlays ------------------------------------------------------

  const hasActivities = activities.length > 0 || isRestoring

  // Measured once as the dialog opens — not on every activities change while
  // it's up, which would re-serialize the whole library each time.
  const [estimatedSizeBytes, setEstimatedSizeBytes] = useState(0)
  const openPublish = useCallback(() => {
    setEstimatedSizeBytes(estimatePayloadSize())
    setPublishOpen(true)
  }, [estimatePayloadSize])

  const flyToLatestActivity = () => {
    const start = latestActivityStart(activities)
    if (start) mapRef.current?.flyTo({ ...start, zoom: 12 })
  }

  const header = (
    <Header
      onLogoClick={flyToLatestActivity}
      onExportClick={() => setExportOpen(true)}
      onPublishClick={openPublish}
      hasActivities={hasActivities}
      stravaAvailable={STRAVA_AVAILABLE}
      stravaConnected={stravaConnected}
      isStravaSyncing={isSyncing}
      stravaError={syncError}
      onStravaConnect={connect}
      onStravaAbortSync={abortSync}
    />
  )

  return (
    <MapView
      activities={activities}
      loading={isSyncing}
      header={header}
      setupPanel={<SetupPanel onDisconnect={stravaConnected ? handleDisconnect : undefined} />}
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
