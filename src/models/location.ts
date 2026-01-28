export interface ActivityCluster {
  id: string
  centroid: { latitude: number; longitude: number }
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  activityIds: string[]
  activityCount: number
  displayName: string // e.g., "37.7°N, 122.4°W"
}
