'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Activity, ActivityFeatureCollection } from '@/models/activity'
import { loadComparisonActivities } from '@/lib/comparison-activities'
import { activitiesToGeoData } from '@/lib/activities'
import { runRouteComparison } from '@/lib/run-route-comparison'
import { filterComparisonActivities, type ComparisonFilters } from '@/lib/comparison-filters'
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
) {
  const [ownLibrary, setOwnLibrary] = useState<{ activities: Activity[]; routes: ActivityFeatureCollection } | null>(
    null,
  )
  const filterKey = filters ? JSON.stringify([filters.types, filters.cutoff]) : ''
  const [previousFilterKey, setPreviousFilterKey] = useState(filterKey)
  const [enabled, setEnabled] = useState(false)
  const [state, setState] = useState<CommonRoutesState>({ status: 'loading' })
  if (previousFilterKey !== filterKey) {
    setPreviousFilterKey(filterKey)
    setState({ status: 'loading' })
  }
  const toggle = useCallback(() => {
    // Keep completed geometry for quick off/on toggles. The parent remounts this
    // hook on logout or navigation, so results never survive the session/map.
    setState((value) => (value.status === 'error' ? { status: 'loading' } : value))
    setEnabled((value) => !value)
  }, [])
  const retry = useCallback(() => {
    setState({ status: 'loading' })
  }, [])

  useEffect(() => {
    if (!enabled || !activities || state.status !== 'loading') return
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
          ownActivities = await loadComparisonActivities(auth.accessToken, controller.signal)
          if (controller.signal.aborted) return
        }
        if (!ownActivities.some((activity) => (activity.feature?.geometry.coordinates.length ?? 0) >= 2)) {
          throw new Error('no_routes')
        }
        const data = await runRouteComparison(
          filters ? filterComparisonActivities(activities, filters) : activities,
          filters ? filterComparisonActivities(ownActivities, filters) : ownActivities,
          controller.signal,
        )
        if (!controller.signal.aborted) {
          const ownRoutes = ownLibrary?.routes ?? activitiesToGeoData(ownActivities)
          if (!ownLibrary) setOwnLibrary({ activities: ownActivities, routes: ownRoutes })
          setState({ status: 'ready', data, ownRoutes })
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : 'comparison_failed')
      }
    })()
    return () => {
      controller.abort()
    }
  }, [activities, enabled, state.status, resolveAccessToken, ownLibrary, filters])

  const visibleState: CommonRoutesState =
    state.status === 'loading' && ownLibrary
      ? { status: 'ready', data: EMPTY_ROUTES, ownRoutes: ownLibrary.routes }
      : state
  return { enabled, state: enabled ? visibleState : null, toggle, retry }
}
