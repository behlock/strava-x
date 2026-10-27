import type { Activity, ActivityFeatureCollection } from '@/models/activity'

/** Shared map properties let both libraries use the same sport/date filters. */
export function activitiesToGeoData(activities: Activity[]): ActivityFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: activities.flatMap((activity) =>
      activity.feature
        ? [
            {
              type: 'Feature' as const,
              geometry: activity.feature.geometry,
              properties: { id: activity.id, type: activity.type || 'unknown', dateTs: activity.date?.getTime() ?? 0 },
            },
          ]
        : [],
    ),
  }
}

/** Start coordinate of the most recent activity that has a track, or `null`. */
export function latestActivityStart(activities: Activity[]): { latitude: number; longitude: number } | null {
  let latest: Activity | null = null
  for (const a of activities) {
    if (!a.date || !a.feature?.geometry.coordinates.length) continue
    if (!latest?.date || a.date > latest.date) latest = a
  }
  const start = latest?.feature?.geometry.coordinates[0]
  if (!start) return null
  const [longitude, latitude] = start
  return { latitude, longitude }
}

/** Newest first; undated activities sink to the bottom. */
export function sortActivitiesByDateDesc(activities: Activity[]): Activity[] {
  return [...activities].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
}
