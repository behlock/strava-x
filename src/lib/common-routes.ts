import type { Activity, ActivityFeatureCollection } from '@/models/activity'

// Summary polylines are approximate: these are shared corridors, not road IDs.
const TOLERANCE = 25
const MIN_SHARED_LENGTH = 100
const SAMPLE_LENGTH = 20
const INDEX_LENGTH = 40
const CELL_SIZE = 64
const MIN_ALIGNMENT = Math.cos(Math.PI / 6)
const EARTH_RADIUS = 6_371_000
const MAX_PIECES = 2_000_000

type Point = [number, number, number]
type Coordinate = number[]
interface Segment {
  start: Point
  direction: Point
  length: number
}

function valid(coordinate: Coordinate): boolean {
  return (
    Number.isFinite(coordinate[0]) &&
    Number.isFinite(coordinate[1]) &&
    Math.abs(coordinate[0]) <= 180 &&
    Math.abs(coordinate[1]) <= 90
  )
}

function point([lng, lat]: Coordinate): Point {
  const phi = (lat * Math.PI) / 180
  const theta = (lng * Math.PI) / 180
  const radius = EARTH_RADIUS * Math.cos(phi)
  return [radius * Math.cos(theta), radius * Math.sin(theta), EARTH_RADIUS * Math.sin(phi)]
}

function segment(start: Point, end: Point): Segment {
  const delta = end.map((value, i) => value - start[i]) as Point
  const length = Math.hypot(...delta)
  return { start, length, direction: delta.map((value) => value / (length || 1)) as Point }
}

function interpolate(start: Coordinate, end: Coordinate, fraction: number): Coordinate {
  const delta = ((((end[0] - start[0]) % 360) + 540) % 360) - 180
  return [((start[0] + delta * fraction + 540) % 360) - 180, start[1] + (end[1] - start[1]) * fraction]
}

function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`
}

function distanceToSegment(p: Point, s: Segment): number {
  const along = Math.max(
    0,
    Math.min(
      s.length,
      s.direction.reduce((sum, value, i) => sum + (p[i] - s.start[i]) * value, 0),
    ),
  )
  return Math.hypot(...p.map((value, i) => value - s.start[i] - along * s.direction[i]))
}

/**
 * Clip the public person's polylines to sustained, direction-compatible overlap
 * with the viewer's library. All sports and both travel directions count.
 * A 3D earth-centred spatial hash keeps distances in metres at every latitude
 * and across the antimeridian. This runs in a disposable Web Worker.
 */
export function findCommonRoutes(publicActivities: Activity[], ownActivities: Activity[]): ActivityFeatureCollection {
  const result: ActivityFeatureCollection = { type: 'FeatureCollection', features: [] }
  const grid = new Map<string, Segment[]>()
  let pieces = 0
  const consumePiece = () => {
    if (++pieces > MAX_PIECES) throw new Error('comparison_too_large')
  }

  for (const activity of ownActivities) {
    const coordinates = activity.feature?.geometry.coordinates ?? []
    for (let i = 1; i < coordinates.length; i++) {
      const a = coordinates[i - 1]
      const b = coordinates[i]
      if (!valid(a) || !valid(b)) continue
      const count = Math.ceil(segment(point(a), point(b)).length / INDEX_LENGTH)
      let start = point(a)
      for (let j = 1; j <= count; j++) {
        consumePiece()
        const end = point(interpolate(a, b, j / count))
        const s = segment(start, end)
        const cell = start.map((value, axis) => Math.floor((value + end[axis]) / 2 / CELL_SIZE))
        const key = cellKey(cell[0], cell[1], cell[2])
        const bucket = grid.get(key)
        if (bucket) bucket.push(s)
        else grid.set(key, [s])
        start = end
      }
    }
  }
  if (!grid.size) return result

  function matches(p: Point, direction: Point): boolean {
    const [x, y, z] = p.map((value) => Math.floor(value / CELL_SIZE))
    // A candidate midpoint is at most tolerance + half INDEX_LENGTH away.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const candidates = grid.get(cellKey(x + dx, y + dy, z + dz))
          if (!candidates) continue
          for (const candidate of candidates) {
            const alignment = Math.abs(direction.reduce((sum, value, i) => sum + value * candidate.direction[i], 0))
            if (alignment >= MIN_ALIGNMENT && distanceToSegment(p, candidate) <= TOLERANCE) return true
          }
        }
      }
    }
    return false
  }

  pieces = 0
  for (const activity of publicActivities) {
    const coordinates = activity.feature?.geometry.coordinates ?? []
    let run: Coordinate[] = []
    let runLength = 0
    const flush = () => {
      if (runLength >= MIN_SHARED_LENGTH && run.length >= 2) {
        result.features.push({
          type: 'Feature',
          properties: { id: activity.id, type: activity.type ?? 'unknown', dateTs: activity.date?.getTime() ?? 0 },
          geometry: { type: 'LineString', coordinates: run },
        })
      }
      run = []
      runLength = 0
    }
    for (let i = 1; i < coordinates.length; i++) {
      const a = coordinates[i - 1]
      const b = coordinates[i]
      if (!valid(a) || !valid(b)) {
        flush()
        continue
      }
      const count = Math.ceil(segment(point(a), point(b)).length / SAMPLE_LENGTH)
      let startCoordinate = a
      let start = point(a)
      for (let j = 1; j <= count; j++) {
        consumePiece()
        const endCoordinate = interpolate(a, b, j / count)
        const end = point(endCoordinate)
        const s = segment(start, end)
        const midpoint = start.map((value, axis) => (value + end[axis]) / 2) as Point
        if (matches(midpoint, s.direction) && matches(start, s.direction) && matches(end, s.direction)) {
          if (!run.length) run.push(startCoordinate)
          run.push(endCoordinate)
          runLength += s.length
        } else {
          flush()
        }
        start = end
        startCoordinate = endCoordinate
      }
    }
    flush()
  }
  return result
}
