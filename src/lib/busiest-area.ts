import { Activity } from '@/models/activity'

export interface BusiestArea {
  // [[west, south], [east, north]]
  bounds: [[number, number], [number, number]]
  center: { latitude: number; longitude: number }
  count: number
}

const CELL_SIZE_DEG = 0.1
const MIN_ACTIVITIES = 3
const PAD_RATIO = 0.1

function cellKey(lng: number, lat: number): string {
  const cx = Math.floor(lng / CELL_SIZE_DEG)
  const cy = Math.floor(lat / CELL_SIZE_DEG)
  return `${cx}:${cy}`
}

export function findBusiestArea(activities: Activity[]): BusiestArea | null {
  const starts: Array<[number, number]> = []
  for (const a of activities) {
    const coords = a.feature?.geometry?.coordinates
    if (!coords || coords.length === 0) continue
    const first = coords[0]
    if (!Array.isArray(first) || first.length < 2) continue
    const [lng, lat] = first
    if (typeof lng !== 'number' || typeof lat !== 'number') continue
    if (Number.isNaN(lng) || Number.isNaN(lat)) continue
    starts.push([lng, lat])
  }

  if (starts.length < MIN_ACTIVITIES) return null

  const cells = new Map<string, { cx: number; cy: number; count: number }>()
  for (const [lng, lat] of starts) {
    const cx = Math.floor(lng / CELL_SIZE_DEG)
    const cy = Math.floor(lat / CELL_SIZE_DEG)
    const key = `${cx}:${cy}`
    const existing = cells.get(key)
    if (existing) existing.count++
    else cells.set(key, { cx, cy, count: 1 })
  }

  let heaviest: { cx: number; cy: number; count: number } | null = null
  for (const cell of cells.values()) {
    if (!heaviest || cell.count > heaviest.count) heaviest = cell
  }
  if (!heaviest) return null

  const neighborKeys = new Set<string>()
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      neighborKeys.add(`${heaviest.cx + dx}:${heaviest.cy + dy}`)
    }
  }

  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  let inCluster = 0
  for (const [lng, lat] of starts) {
    if (!neighborKeys.has(cellKey(lng, lat))) continue
    inCluster++
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  if (inCluster === 0) return null

  // Pad slightly so points don't sit on the very edge of the viewport.
  const lngSpan = Math.max(maxLng - minLng, CELL_SIZE_DEG)
  const latSpan = Math.max(maxLat - minLat, CELL_SIZE_DEG)
  const padLng = lngSpan * PAD_RATIO
  const padLat = latSpan * PAD_RATIO
  const w = minLng - padLng
  const e = maxLng + padLng
  const s = minLat - padLat
  const n = maxLat + padLat

  return {
    bounds: [
      [w, s],
      [e, n],
    ],
    center: { latitude: (s + n) / 2, longitude: (w + e) / 2 },
    count: inCluster,
  }
}
