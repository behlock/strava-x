import type { Activity } from '@/models/activity'
import type { SerializedActivity } from '@/lib/activities-serialize'

/** Deliberate allowlist: never serialize arbitrary imported/cached properties. */
export function publicActivities(activities: Activity[]): SerializedActivity[] {
  return activities
    .map((activity) => ({
      id: activity.id,
      type: activity.type,
      // Public maps need a calendar date, not the athlete's precise start time.
      date: activity.date?.toISOString().slice(0, 10),
      distance: activity.distance,
      elevationGain: activity.elevationGain,
      feature: activity.feature
        ? {
            type: 'Feature' as const,
            geometry: { type: 'LineString' as const, coordinates: activity.feature.geometry.coordinates },
            properties: {},
          }
        : null,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Stable field/order canonicalization also used to verify a client's upload. */
export function canonicalSnapshot(value: unknown): string {
  if (!Array.isArray(value) || value.length > 50_000) throw new Error('invalid_activities')
  const ids = new Set<string>()
  const entries = value
    .map((entry) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof entry.id !== 'string' ||
        ids.has(entry.id) ||
        !(entry.type === null || typeof entry.type === 'string') ||
        !Number.isFinite(entry.distance) ||
        entry.distance < 0 ||
        !Number.isFinite(entry.elevationGain) ||
        entry.elevationGain < 0 ||
        !(entry.date === undefined || (typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)))
      ) {
        throw new Error('invalid_activities')
      }
      ids.add(entry.id)
      let feature: SerializedActivity['feature'] = null
      if (entry.feature !== null) {
        const coordinates = entry.feature?.geometry?.coordinates
        if (
          !Array.isArray(coordinates) ||
          coordinates.length < 2 ||
          !coordinates.every(
            (point: unknown) =>
              Array.isArray(point) &&
              point.length === 2 &&
              Number.isFinite(point[0]) &&
              Number.isFinite(point[1]) &&
              Math.abs(point[0]) <= 180 &&
              Math.abs(point[1]) <= 90,
          )
        )
          throw new Error('invalid_activities')
        feature = { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} }
      }
      return {
        id: entry.id,
        type: entry.type,
        date: entry.date,
        distance: entry.distance,
        elevationGain: entry.elevationGain,
        feature,
      }
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return JSON.stringify(entries)
}

export interface VerifiedSnapshot {
  activities: SerializedActivity[]
  proof: string
  fingerprint: string
  athleteId: number
  revision: string
  expiresAt: number
}
export interface ShareState {
  athleteId: number
  slug: string | null
  revision: string
  fingerprint: string | null
}
