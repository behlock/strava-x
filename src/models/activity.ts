import type { Feature as GeoJSONFeature, LineString, FeatureCollection } from 'geojson'

export interface TrackPoint {
  latitude: number
  longitude: number
  elevation: number
}

export type ActivityFeature = GeoJSONFeature<LineString, { id?: string }>

export interface Activity {
  id: string
  type: string | null
  date?: Date
  feature: ActivityFeature | null
  distance: number // in kilometers
  elevationGain: number // in meters
}

export type ActivityFeatureCollection = FeatureCollection<LineString, { id: string }>
