'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Activity, ActivityFeatureCollection } from '@/models/activity'
import { loadComparisonActivities } from '@/lib/comparison-activities'
import { activitiesToGeoData } from '@/lib/activities'
import { createRouteComparisonClient } from '@/lib/run-route-comparison'
import { comparisonFilterKey, type ComparisonFilters } from '@/lib/comparison-filters'
import type { UseStravaAuth } from '@/hooks/use-strava-auth'

export type CommonRoutesState =
  | { status: 'loading' }
  | { status: 'ready'; data: ActivityFeatureCollection; ownRoutes: ActivityFeatureCollection }
  | { status: 'error'; message: string }

const EMPTY_ROUTES: ActivityFeatureCollection = { type: 'FeatureCollection', features: [] }

const ERRORS: Record<string, string> = {
  strava_unauthorized: 'your session expired. reconnect strava from your map to compare.',
  strava_rate_limited: 'strava is busy. try again in 15 minutes.',
  comparison_too_large: 'these libraries are too large to compare in this browser.',
  no_routes: 'your library has no mapped activities to compare yet.',
}

export function useCommonRoutes(
  activities: Activity[] | null,
  resolveAccessToken: UseStravaAuth['resolveAccessToken'],
  filters?: ComparisonFilters,
  prewarm = false,
  loadFull?: () => Promise<Activity[]>,
) {
  const fullLibrary = useRef<Activity[] | null>(null)
  const client = useRef<ReturnType<typeof createRouteComparisonClient> | null>(null)
  const [prepared, setPrepared] = useState(false)
  useEffect(() => {
    if (!prewarm || !activities?.length) return
    const timer = setTimeout(() => {
      if (document.visibilityState === 'visible') setPrepared(true)
    }, 1500)
    return () => clearTimeout(timer)
  }, [prewarm, activities])
  useEffect(() => {
    fullLibrary.current = null
  }, [activities, loadFull])
  useEffect(
    () => () => {
      client.current?.dispose()
      client.current = null
    },
    [],
  )
  const [ownLibrary, setOwnLibrary] = useState<{ activities: Activity[]; routes: ActivityFeatureCollection } | null>(
    null,
  )
  const filterKey = comparisonFilterKey(filters)
  const [previousActivities, setPreviousActivities] = useState(activities)
  const [previousFilterKey, setPreviousFilterKey] = useState(filterKey)
  const [enabled, setEnabled] = useState(false)
  const [state, setState] = useState<CommonRoutesState>({ status: 'loading' })
  if (previousFilterKey !== filterKey || previousActivities !== activities) {
    setPreviousActivities(activities)
    setPreviousFilterKey(filterKey)
    setState({ status: 'loading' })
  }
  const toggle = useCallback(() => {
    // Keep completed geometry for quick off/on toggles. The parent remounts this
    // hook on logout or navigation, so results never survive the session/map.
    setState((value) => (value.status === 'error' ? { status: 'loading' } : value))
    setPrepared(false)
    setEnabled((value) => !value)
  }, [])
  const retry = useCallback(() => {
    setState({ status: 'loading' })
  }, [])

  useEffect(() => {
    if ((!enabled && !prepared) || !activities || state.status !== 'loading') return
    const controller = new AbortController()
    const fail = (code: string) => {
      if (!controller.signal.aborted) {
        setState({ status: 'error', message: ERRORS[code] ?? "couldn't compare these maps. try again." })
      }
    }
    void (async () => {
      try {
        let ownActivities = ownLibrary?.activities
        if (!ownActivities) {
          const auth = await resolveAccessToken()
          if (controller.signal.aborted) return
          if (auth.status === 'unauthenticated') throw new Error('strava_unauthorized')
          if (auth.status !== 'ok') throw new Error('strava_unavailable')
          ownActivities = await loadComparisonActivities(auth.accessToken, controller.signal, !enabled)
          if (controller.signal.aborted) return
        }
        if (!ownActivities.some((activity) => (activity.feature?.geometry.coordinates.length ?? 0) >= 2)) {
          throw new Error('no_routes')
        }
        const publicActivities = loadFull ? (fullLibrary.current ?? (await loadFull())) : activities
        if (controller.signal.aborted) return
        fullLibrary.current = publicActivities
        client.current ??= createRouteComparisonClient()
        const data = await client.current.run(publicActivities, ownActivities, controller.signal, filters)
        if (!controller.signal.aborted) {
          const ownRoutes = ownLibrary?.routes ?? activitiesToGeoData(ownActivities)
          if (!ownLibrary) setOwnLibrary({ activities: ownActivities, routes: ownRoutes })
          setState({ status: 'ready', data, ownRoutes })
        }
      } catch (error) {
        if (!enabled) {
          if (!controller.signal.aborted) setPrepared(false)
          return
        }
        fail(error instanceof Error ? error.message : 'comparison_failed')
      }
    })()
    return () => {
      controller.abort()
    }
  }, [activities, enabled, state.status, resolveAccessToken, ownLibrary, filters, prepared, loadFull])

  const visibleState: CommonRoutesState =
    state.status === 'loading' && ownLibrary
      ? { status: 'ready', data: EMPTY_ROUTES, ownRoutes: ownLibrary.routes }
      : state
  return {
    enabled,
    state: enabled ? visibleState : null,
    retained: state.status === 'ready' ? state : null,
    toggle,
    retry,
  }
}
