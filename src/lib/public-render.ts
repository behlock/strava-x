import type { SerializedActivity } from './activities-serialize'

export const TILED_VERTEX_THRESHOLD = 100_000
export interface PublicSnapshot {
  version: number
  updatedAt?: string
  activities: SerializedActivity[]
}

/** Preview geometry is for bounds/list navigation only, never overlap or map drawing. */
export function preparePublicPreview(activities: SerializedActivity[]): SerializedActivity[] | undefined {
  const vertices = activities.reduce((n, a) => n + (a.feature?.geometry.coordinates.length ?? 0), 0)
  if (vertices < TILED_VERTEX_THRESHOLD) return undefined
  return activities.map((activity) => {
    const coordinates = activity.feature?.geometry.coordinates
    if (!coordinates?.length || !activity.feature) return activity
    const keep = new Set([0, coordinates.length - 1, Math.floor(coordinates.length / 2)])
    const extrema = [0, 0, 0, 0, 0, 0]
    const value = (i: number, axis: number) => (axis < 4 ? coordinates[i][axis >> 1] : (coordinates[i][0] + 360) % 360)
    for (let i = 0; i < coordinates.length; i++) {
      for (let axis = 0; axis < 6; axis++) {
        if (axis % 2 === 0 ? value(i, axis) < value(extrema[axis], axis) : value(i, axis) > value(extrema[axis], axis))
          extrema[axis] = i
      }
      if (i % Math.max(1, Math.ceil(coordinates.length / 32)) === 0) keep.add(i)
    }
    extrema.forEach((i) => keep.add(i))
    return {
      ...activity,
      navigationCoordinate: coordinates[Math.floor(coordinates.length / 2)].slice(0, 2) as [number, number],
      feature: {
        ...activity.feature,
        geometry: { type: 'LineString', coordinates: [...keep].sort((a, b) => a - b).map((i) => coordinates[i]) },
      },
    }
  })
}
