export interface MapPosition {
  latitude: number
  longitude: number
  zoom: number
}

/** London, used when there is nothing better to frame. */
export const DEFAULT_MAP_POSITION: MapPosition = { latitude: 51.5074, longitude: -0.1278, zoom: 15 }

/** GeoJSON order: `[longitude, latitude]`. */
export type LngLat = [number, number]

/** `[[west, south], [east, north]]` — the shape Mapbox's `fitBounds` accepts. */
export type MapBounds = [LngLat, LngLat]
