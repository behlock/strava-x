'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

import type { ShareState, VerifiedSnapshot } from '@/lib/share-snapshot'
import { deserializeActivities, type SerializedActivity } from '@/lib/activities-serialize'
import type { ActivityMapRef } from '@/components/activity-map'
import { MapView } from '@/components/map-view'
import { Header } from '@/components/ui'
import { latestActivityStart } from '@/lib/activities'
import { replaceActivities } from '@/lib/activities-db'
import { config } from '@/lib/config'
import { usePersistedActivities } from '@/hooks/use-persisted-activities'
import { usePublish } from '@/hooks/use-publish'
import { useStravaProfile } from '@/hooks/use-strava-profile'
import { useStravaAuth } from '@/hooks/use-strava-auth'

const STRAVA_AVAILABLE = Boolean(config.STRAVA_CLIENT_ID)

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
  const { activities, setActivities, restore: restoreActivities, clear: clearActivities } = usePersistedActivities()
  const { isConnected: stravaConnected, connect, disconnect, getAccessToken, resolveAccessToken } = useStravaAuth()

  const stravaProfile = useStravaProfile(stravaConnected, getAccessToken)

  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [mapUpdateError, setMapUpdateError] = useState<string | null>(null)
  const [sharingAvailable, setSharingAvailable] = useState(true)
  const [publishOpen, setPublishOpen] = useState(false)
  const mapRef = useRef<ActivityMapRef | null>(null)

  const welcomeOpen = !stravaConnected && activities.length === 0

  const {
    currentSlug,
    routesVerified,
    isPublishing,
    estimatePayloadSize,
    checkSlug,
    publish,
    unpublish,
    updatePublishedMap,
    refreshCurrentSlug,
    beginSync,
    forgetCurrentSlug,
  } = usePublish({ getAccessToken })

  const syncAbortRef = useRef<AbortController | null>(null)
  // Complete-library IndexedDB writes that haven't settled; a disconnect
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
    const sharingVersion = beginSync()
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
      setMapUpdateError(null)
      // Account ownership must be known before any cached library is shown.
      const share = await refreshCurrentSlug(signal).catch(() => undefined)
      if (!isLive()) return
      if (share) await restoreActivities(share.athleteId, signal)
      if (!isLive()) return
      const response = await fetch('/api/activities/sync', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: auth.accessToken, routeAccessProof: auth.routeAccessProof }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'sync_failed')
      }
      const result = (await response.json()) as {
        activities: SerializedActivity[]
        athleteId: number
        snapshot: VerifiedSnapshot | null
        share: ShareState | null
      }
      if (!isLive() || (share && result.athleteId !== share.athleteId)) return
      const completed = deserializeActivities(result.activities)
      setActivities(completed)
      const save = replaceActivities(result.athleteId, completed)
        .catch(() => {
          if (isLive()) setSyncError("activities loaded but couldn't be saved to browser storage")
        })
        .finally(() => pendingSavesRef.current.delete(save))
      pendingSavesRef.current.add(save)
      const canShare = Boolean(result.share && result.snapshot)
      setSharingAvailable(canShare)
      if (!result.share || !result.snapshot) {
        forgetCurrentSlug()
        return
      }
      // Includes an empty library: removed/private activities must disappear publicly too.
      const update = await updatePublishedMap(result.snapshot, result.share, sharingVersion, signal)
      if (
        isLive() &&
        update &&
        'error' in update &&
        !['busy', 'publication_changed', 'cancelled'].includes(update.error)
      ) {
        setMapUpdateError('your map could not be updated')
      }
    } catch (err) {
      if (signal.aborted || (err as Error)?.name === 'AbortError') return
      const code = err instanceof Error ? err.message : ''
      setSyncError(SYNC_ERRORS[code] ?? 'strava sync failed, try again')
      if (code === 'strava_unauthorized') disconnect()
    } finally {
      if (syncAbortRef.current === controller) syncAbortRef.current = null
      if (!signal.aborted) setIsSyncing(false)
    }
  }, [
    resolveAccessToken,
    setActivities,
    disconnect,
    updatePublishedMap,
    beginSync,
    refreshCurrentSlug,
    restoreActivities,
    forgetCurrentSlug,
  ])

  const abortSync = useCallback(() => {
    syncAbortRef.current?.abort()
    syncAbortRef.current = null
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    setIsSyncing(false)
  }, [])

  const clearSession = useCallback(() => {
    abortSync()
    sessionGenerationRef.current++
    hasAutoSyncedRef.current = false
    hasRetriedRef.current = false
    setPublishOpen(false)
    setSyncError(null)
    setMapUpdateError(null)
    // State empties right away; the store is wiped only once the page writes
    // still in flight have settled, so none of them can land after the wipe.
    void clearActivities(Promise.allSettled([...pendingSavesRef.current])).catch(() => {})
    // Disconnecting doesn't unpublish on the server — the user may reconnect
    // later. But we drop the local "currentSlug" so the UI doesn't keep
    // claiming they own a slug we can no longer verify.
    forgetCurrentSlug()
  }, [abortSync, clearActivities, forgetCurrentSlug])

  const handleDisconnect = useCallback(() => {
    clearSession()
    void disconnect()
  }, [clearSession, disconnect])

  const wasConnected = useRef(stravaConnected)
  useEffect(() => {
    if (wasConnected.current && !stravaConnected) clearSession()
    wasConnected.current = stravaConnected
  }, [stravaConnected, clearSession])

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

  const hasActivities = activities.length > 0 || Boolean(currentSlug)

  // Measured once as the dialog opens — not on every activities change while
  // it's up, which would re-serialize the whole library each time.
  const [estimatedSizeBytes, setEstimatedSizeBytes] = useState(0)
  const openPublish = useCallback(() => {
    void refreshCurrentSlug().catch(() => {})
    setEstimatedSizeBytes(estimatePayloadSize())
    setPublishOpen(true)
  }, [estimatePayloadSize, refreshCurrentSlug])

  const flyToLatestActivity = () => {
    const start = latestActivityStart(activities)
    if (start) mapRef.current?.flyTo({ ...start, zoom: 12 })
  }

  const header = (
    <Header
      onLogoClick={flyToLatestActivity}
      onPublishClick={openPublish}
      currentSlug={currentSlug}
      hasActivities={hasActivities && sharingAvailable}
      stravaAvailable={STRAVA_AVAILABLE}
      stravaConnected={stravaConnected}
      profilePhotoUrl={stravaProfile?.photoUrl}
      mapUpdateError={mapUpdateError}
      sharingAvailable={sharingAvailable}
      isStravaSyncing={isSyncing}
      stravaError={syncError}
      onStravaConnect={welcomeOpen ? undefined : connect}
      onStravaDisconnect={handleDisconnect}
    />
  )

  return (
    <MapView
      activities={activities}
      loading={isSyncing}
      preferBusiestArea={stravaConnected}
      header={header}
      externalMapRef={mapRef}
      overlays={
        <>
          <PublishDialog
            open={publishOpen}
            onClose={() => setPublishOpen(false)}
            currentSlug={currentSlug}
            suggestedAddress={stravaProfile?.suggestedAddress}
            isPublishing={isPublishing}
            routesVerified={routesVerified}
            onReconnect={connect}
            estimatedSizeBytes={estimatedSizeBytes}
            publish={publish}
            unpublish={unpublish}
            checkSlug={checkSlug}
          />
          <WelcomePanel open={welcomeOpen} onConnect={connect} />
        </>
      }
    />
  )
}
