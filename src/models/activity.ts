import type { Feature, FeatureCollection, LineString } from 'geojson'

/** The sport categories the UI filters on. Everything else is kept but hidden by the default filters. */
export const ACTIVITY_TYPES = ['cycling', 'hiking', 'running', 'walking'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export type ActivityFeature = Feature<LineString, { id?: string }>

export interface Activity {
  id: string
  /** One of `ACTIVITY_TYPES`, or the raw lowercased Strava sport type for anything unmapped. */
  type: string | null
  date?: Date
  feature: ActivityFeature | null
  /** Kilometers. */
  distance: number
  /** Meters. */
  elevationGain: number
}

export type ActivityFeatureCollection = FeatureCollection<LineString, { id: string; type: string; dateTs: number }>
