import type { Activity } from '@/models/activity'

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

/** Appends activities not already present (by id), keeping newest-first order. */
export function mergeActivities(existing: Activity[], incoming: Activity[]): Activity[] {
  const known = new Set(existing.map((a) => a.id))
  const fresh = incoming.filter((a) => !known.has(a.id))
  return fresh.length === 0 ? existing : sortActivitiesByDateDesc([...existing, ...fresh])
}
