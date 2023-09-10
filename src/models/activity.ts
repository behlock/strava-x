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
  type: string | null
  date?: Date
  feature: Feature | null
}
