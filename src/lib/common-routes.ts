import type { Activity, ActivityFeatureCollection } from '@/models/activity'
import type { ComparisonFilters } from './comparison-filters'

// A shared corridor stays within 25 m, aligns in either direction, and spans at least 100 m.
const TOLERANCE_SQUARED = 25 * 25
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
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
  length: number
  owner: number
}

function valid(p: Coordinate): boolean {
  return Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90
}
function point([lng, lat]: Coordinate): Point {
  const phi = (lat * Math.PI) / 180,
    theta = (lng * Math.PI) / 180
  const radius = EARTH_RADIUS * Math.cos(phi)
  return [radius * Math.cos(theta), radius * Math.sin(theta), EARTH_RADIUS * Math.sin(phi)]
}
function segment(a: Point, b: Point, owner = 0): Segment {
  const x = b[0] - a[0],
    y = b[1] - a[1],
    z = b[2] - a[2]
  const length = Math.hypot(x, y, z)
  return {
    x: a[0],
    y: a[1],
    z: a[2],
    dx: x / (length || 1),
    dy: y / (length || 1),
    dz: z / (length || 1),
    length,
    owner,
  }
}
function interpolate(a: Coordinate, b: Coordinate, fraction: number): Coordinate {
  const delta = ((((b[0] - a[0]) % 360) + 540) % 360) - 180
  return [((a[0] + delta * fraction + 540) % 360) - 180, a[1] + (b[1] - a[1]) * fraction]
}
// Collisions only add candidates. Exact 3D distances below always decide matches.
function cellKey(x: number, y: number, z: number): number {
  return Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)
}
function close(x: number, y: number, z: number, s: Segment): boolean {
  const px = x - s.x,
    py = y - s.y,
    pz = z - s.z
  const along = Math.max(0, Math.min(s.length, s.dx * px + s.dy * py + s.dz * pz))
  return (px - along * s.dx) ** 2 + (py - along * s.dy) ** 2 + (pz - along * s.dz) ** 2 <= TOLERANCE_SQUARED
}
function eligible(a: Activity, filters?: ComparisonFilters): boolean {
  return (
    !filters ||
    (filters.types.includes(a.type || 'unknown') &&
      (filters.cutoff === null || (a.date?.getTime() ?? 0) <= filters.cutoff))
  )
}

/** Reuse a full-library index when it fits; otherwise index only the eligible subset. */
export function createRouteComparison(publicActivities: Activity[], ownActivities: Activity[]) {
  const grid = new Map<number, Segment[]>()
  // Repeated recordings can have identical tracks. Index that geometry once,
  // retaining every owner's metadata so either eligible recording can match.
  const groups: Activity[][] = []
  const geometryOwners = new Map<string, number>()
  for (const activity of ownActivities) {
    const coordinates = activity.feature?.geometry.coordinates
    if (!coordinates?.length) continue
    const key = JSON.stringify(coordinates)
    const existing = geometryOwners.get(key)
    if (existing !== undefined) groups[existing].push(activity)
    else {
      geometryOwners.set(key, groups.length)
      groups.push([activity])
    }
  }
  geometryOwners.clear()
  // Count before allocating segments. Oversized libraries can still compare a
  // small sport/date selection, rather than failing while indexing excluded routes.
  const pieceCounts = new Map<number, number>()
  function fitsBudget(owners?: boolean[]): boolean {
    let total = 0
    for (let owner = 0; owner < groups.length; owner++) {
      if (owners && !owners[owner]) continue
      let count = pieceCounts.get(owner)
      if (count === undefined) {
        count = 0
        const coordinates = groups[owner][0].feature?.geometry.coordinates ?? []
        for (let i = 1; i < coordinates.length; i++) {
          const a = coordinates[i - 1],
            b = coordinates[i]
          if (!valid(a) || !valid(b)) continue
          count += Math.ceil(segment(point(a), point(b)).length / INDEX_LENGTH)
          if (count > MAX_PIECES) break
        }
        pieceCounts.set(owner, count)
      }
      total += count
      if (total > MAX_PIECES) return false
    }
    return true
  }
  let fullIndexFits: boolean | undefined
  let indexedOwners: boolean[] | undefined
  function ensureIndex(active: boolean[]) {
    // A retained index also serves narrower selections; matches still checks active.
    if (indexedOwners && active.every((included, owner) => !included || indexedOwners![owner])) return
    fullIndexFits ??= fitsBudget()
    const owners = fullIndexFits ? groups.map(() => true) : active
    if (!fullIndexFits && !fitsBudget(owners)) throw new Error('comparison_too_large')
    // Keep one index at a time, even when switching between large-library filters.
    grid.clear()
    indexedOwners = undefined
    for (let owner = 0; owner < groups.length; owner++) {
      if (!owners[owner]) continue
      const coordinates = groups[owner][0].feature?.geometry.coordinates ?? []
      for (let i = 1; i < coordinates.length; i++) {
        const a = coordinates[i - 1],
          b = coordinates[i]
        if (!valid(a) || !valid(b)) continue
        let start = point(a)
        const count = Math.ceil(segment(start, point(b)).length / INDEX_LENGTH)
        for (let j = 1; j <= count; j++) {
          const end = point(interpolate(a, b, j / count))
          const s = segment(start, end, owner)
          const key = cellKey(
            Math.floor((start[0] + end[0]) / 2 / CELL_SIZE),
            Math.floor((start[1] + end[1]) / 2 / CELL_SIZE),
            Math.floor((start[2] + end[2]) / 2 / CELL_SIZE),
          )
          const bucket = grid.get(key)
          if (bucket) bucket.push(s)
          else grid.set(key, [s])
          start = end
        }
      }
    }
    indexedOwners = owners
  }
  return (filters?: ComparisonFilters): ActivityFeatureCollection => {
    const result: ActivityFeatureCollection = { type: 'FeatureCollection', features: [] }
    const active = groups.map((owners) => owners.some((a) => eligible(a, filters)))
    if (!active.some(Boolean)) return result
    ensureIndex(active)
    if (!grid.size) return result
    let last: Segment | undefined
    function matches(x: number, y: number, z: number, direction: Segment): boolean {
      const aligned = (s: Segment) =>
        Math.abs(direction.dx * s.dx + direction.dy * s.dy + direction.dz * s.dz) >= MIN_ALIGNMENT
      // Adjacent probes usually hit the same segment; avoid another 27-cell search.
      if (last && active[last.owner] && aligned(last) && close(x, y, z, last)) return true
      const cx = Math.floor(x / CELL_SIZE),
        cy = Math.floor(y / CELL_SIZE),
        cz = Math.floor(z / CELL_SIZE)
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            const candidates = grid.get(cellKey(cx + dx, cy + dy, cz + dz))
            if (!candidates) continue
            for (const candidate of candidates) {
              if (active[candidate.owner] && aligned(candidate) && close(x, y, z, candidate)) {
                last = candidate
                return true
              }
            }
          }
      return false
    }
    let pieces = 0
    for (const activity of publicActivities) {
      if (!eligible(activity, filters)) continue
      const coordinates = activity.feature?.geometry.coordinates ?? []
      let run: Coordinate[] = [],
        runLength = 0
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
        const a = coordinates[i - 1],
          b = coordinates[i]
        if (!valid(a) || !valid(b)) {
          flush()
          continue
        }
        let start = point(a),
          startCoordinate = a
        const count = Math.ceil(segment(start, point(b)).length / SAMPLE_LENGTH)
        if ((pieces += count) > MAX_PIECES) throw new Error('comparison_too_large')
        for (let j = 1; j <= count; j++) {
          const endCoordinate = interpolate(a, b, j / count),
            end = point(endCoordinate)
          const s = segment(start, end)
          if (
            matches((start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2, s) &&
            matches(start[0], start[1], start[2], s) &&
            matches(end[0], end[1], end[2], s)
          ) {
            if (!run.length) run.push(startCoordinate)
            run.push(endCoordinate)
            runLength += s.length
          } else flush()
          start = end
          startCoordinate = endCoordinate
        }
      }
      flush()
    }
    return result
  }
}
