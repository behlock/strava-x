export interface TrackPoint {
  latitude: number
  longitude: number
  elevation: number
}

export interface Feature {
  type: string
  geometry: {
    type: string
    coordinates: number[][]
  }
}

export interface Activity {
  id: string
  type: string | null
  date?: Date
  feature: Feature | null
  distance: number // in kilometers
  elevationGain: number // in meters
}
