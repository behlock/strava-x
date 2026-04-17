'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

import { Header } from '@/components/ui'
import { MapView } from '@/components/map-view'
import type { MapboxHeatmapRef } from '@/components/map-view'

import { fetchAllActivities } from '@/lib/strava'
import { config } from '@/lib/config'
import { Activity } from '@/models/activity'
import { serializeActivities } from '@/lib/activities-serialize'
import { usePersistedActivities } from '@/hooks/use-persisted-activities'
import { useStravaAuth } from '@/hooks/use-strava-auth'
import { usePublish } from '@/hooks/use-publish'

const STRAVA_AVAILABLE = !!config.STRAVA_CLIENT_ID

const ExportModal = dynamic(() => import('@/components/export').then((mod) => ({ default: mod.ExportModal })), {
  ssr: false,
})

const PublishDialog = dynamic(() => import('@/components/publish').then((mod) => ({ default: mod.PublishDialog })), {
  ssr: false,
})

const Home = () => {
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const {
    cachedActivities,
    isLoading: isRestoringCache,
    saveActivities: persistActivities,
    clearActivities: clearPersistedActivities,
  } = usePersistedActivities()

  const [allActivities, setAllActivities] = useState<Activity[]>([])

  const {
    isConnected: stravaConnected,
    justConnected: stravaJustConnected,
    connect: stravaConnect,
    disconnect: stravaDisconnect,
    getAccessToken,
  } = useStravaAuth()

  // Restore cached activities once so clearing cache (e.g. via disconnect)
  // doesn't immediately re-hydrate from stale state.
  const hasRestoredCacheRef = useRef(false)
  useEffect(() => {
    if (hasRestoredCacheRef.current) return
    if (cachedActivities && cachedActivities.length > 0) {
      hasRestoredCacheRef.current = true
      setAllActivities(cachedActivities)
    }
  }, [cachedActivities])

  // Mirror allActivities into a ref so async sync callbacks can read the
  // current set without closure-staleness.
  const allActivitiesRef = useRef<Activity[]>(allActivities)
  useEffect(() => {
    allActivitiesRef.current = allActivities
  }, [allActivities])

  const [exportOpen, setExportOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const mapRef = useRef<MapboxHeatmapRef | null>(null)

  // Publishing state
  const { currentSlug, isPublishing, checkSlug, publish, unpublish, refreshCurrentSlug, forgetCurrentSlug } =
    usePublish({
      getAccessToken,
      getActivities: () => allActivitiesRef.current,
    })

  // Rehydrate currentSlug from the server whenever the user becomes connected —
  // covers new devices and cleared localStorage. Independent of auto-sync so
  // it runs even after a disconnect/reconnect in the same session.
  useEffect(() => {
    if (!stravaConnected) return
    refreshCurrentSlug()
  }, [stravaConnected, refreshCurrentSlug])

  // Strava sync
  const syncAbortRef = useRef<AbortController | null>(null)
  const handleStravaSync = useCallback(async () => {
    syncAbortRef.current?.abort()
    const controller = new AbortController()
    syncAbortRef.current = controller
    setIsUploading(true)
    setUploadError(null)
    let merged: Activity[] = allActivitiesRef.current
    try {
      const token = await getAccessToken()
      if (!token) {
        setUploadError('Strava session expired. Please reconnect.')
        return
      }
      const fetched = await fetchAllActivities(token, {
        signal: controller.signal,
        onBatch: (batch) => {
          const existingIds = new Set(merged.map((a) => a.id))
          const fresh = batch.filter((a) => !existingIds.has(a.id))
          if (fresh.length === 0) return
          merged = [...merged, ...fresh].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
          setAllActivities(merged)
        },
      })
      if (controller.signal.aborted) return
      if (fetched.length === 0) {
        setUploadError('No Strava activities found on this account.')
        return
      }
      persistActivities(merged).catch(() => {
        setUploadError('Activities loaded but failed to save to browser storage.')
      })
    } catch (err) {
      if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return
      console.error('Strava sync failed:', err)
      const msg = err instanceof Error ? err.message : 'unknown'
      if (msg === 'strava_unauthorized') {
        setUploadError('Strava authorization expired. Please reconnect.')
        stravaDisconnect()
      } else if (msg === 'strava_rate_limited') {
        setUploadError('Strava rate limit hit. Please try again in 15 minutes.')
      } else {
        setUploadError('Failed to sync from Strava. Please try again.')
      }
    } finally {
      if (syncAbortRef.current === controller) {
        syncAbortRef.current = null
      }
      if (!controller.signal.aborted) {
        setIsUploading(false)
      }
    }
  }, [getAccessToken, persistActivities, stravaDisconnect])

  const handleStravaAbortSync = useCallback(() => {
    syncAbortRef.current?.abort()
    syncAbortRef.current = null
    setIsUploading(false)
    const current = allActivitiesRef.current
    if (current.length > 0) {
      persistActivities(current).catch(() => {})
    }
  }, [persistActivities])

  const hasAutoSyncedRef = useRef(false)

  const handleStravaDisconnect = useCallback(() => {
    syncAbortRef.current?.abort()
    syncAbortRef.current = null
    hasAutoSyncedRef.current = false
    stravaDisconnect()
    setAllActivities([])
    setUploadError(null)
    setIsUploading(false)
    clearPersistedActivities()
    // Disconnecting doesn't unpublish on the server — the user may reconnect
    // later. But we clear the local "currentSlug" cache so the UI doesn't
    // keep claiming they own a slug when we can't verify it.
    forgetCurrentSlug()
  }, [stravaDisconnect, clearPersistedActivities, forgetCurrentSlug])

  useEffect(() => {
    if (hasAutoSyncedRef.current) return
    if (stravaConnected || stravaJustConnected) {
      hasAutoSyncedRef.current = true
      handleStravaSync()
    }
  }, [stravaConnected, stravaJustConnected, handleStravaSync])

  useEffect(() => {
    return () => {
      syncAbortRef.current?.abort()
    }
  }, [])

  const hasActivities = allActivities.length > 0 || isRestoringCache

  // Rough estimate of the publish payload size so the dialog can show a size
  // warning *before* the user clicks publish. Recomputed lazily from a ref so
  // we don't serialize on every render.
  const estimatedSizeRef = useRef(0)
  const [estimatedSizeBytes, setEstimatedSizeBytes] = useState(0)
  useEffect(() => {
    if (!publishOpen) return
    const size = new Blob([JSON.stringify(serializeActivities(allActivities))]).size
    estimatedSizeRef.current = size
    setEstimatedSizeBytes(size)
  }, [publishOpen, allActivities])

  const headerRenderer = useCallback(
    ({ flyToLatestActivity }: { flyToLatestActivity: () => void }) => {
      const handleLogoClick = () => {
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              mapRef.current?.flyTo({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                zoom: 12,
              })
            },
            flyToLatestActivity,
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
          )
        } else {
          flyToLatestActivity()
        }
      }
      return (
        <Header
          onExportClick={() => setExportOpen(true)}
          onLogoClick={handleLogoClick}
          onPublishClick={() => setPublishOpen(true)}
          hasActivities={hasActivities}
          stravaAvailable={STRAVA_AVAILABLE}
          stravaConnected={stravaConnected}
          isStravaSyncing={isUploading}
          stravaError={uploadError}
          onStravaConnect={stravaConnect}
          onStravaDisconnect={handleStravaDisconnect}
          onStravaAbortSync={handleStravaAbortSync}
        />
      )
    },
    [
      hasActivities,
      stravaConnected,
      isUploading,
      uploadError,
      stravaConnect,
      handleStravaDisconnect,
      handleStravaAbortSync,
    ],
  )

  return (
    <MapView
      activities={allActivities}
      loading={isUploading}
      header={headerRenderer}
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
        </>
      }
    />
  )
}

export default Home
