import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

export interface UrbanCentre {
  id: number
  name: string
  names: string[]
  bounds: [number, number, number, number]
  polygons: [number, number][][][]
}

// Keep the source projection: this preserves the original grid boundaries and holes.
export function projectToMollweide(latitude: number, longitude: number): [number, number] {
  const phi = (latitude * Math.PI) / 180
  let theta = phi / 2
  if (Math.abs(latitude) !== 90) {
    for (let i = 0; i < 40; i++) {
      const denominator = 2 + 2 * Math.cos(2 * theta)
      if (denominator < 1e-15) break
      const step = (2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(phi)) / denominator
      theta -= step
      if (Math.abs(step) < 1e-12) break
    }
  } else theta = phi
  const scale = Math.SQRT2 * 6378137
  return [((2 * scale) / Math.PI) * ((longitude * Math.PI) / 180) * Math.cos(theta), scale * Math.sin(theta)]
}

function inRing(x: number, y: number, ring: [number, number][]): boolean | 'boundary' {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j]
    const [bx, by] = ring[i]
    if (
      (x - ax) * (by - ay) === (y - ay) * (bx - ax) &&
      x >= Math.min(ax, bx) &&
      x <= Math.max(ax, bx) &&
      y >= Math.min(ay, by) &&
      y <= Math.max(ay, by)
    )
      return 'boundary'
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside
  }
  return inside
}

export function containsPoint(centre: UrbanCentre, x: number, y: number): boolean {
  const [west, south, east, north] = centre.bounds
  if (x < west || x > east || y < south || y > north) return false
  return centre.polygons.some(
    ([outer, ...holes]) => Boolean(inRing(x, y, outer)) && !holes.some((hole) => inRing(x, y, hole) === true),
  )
}

const CELL_METRES = 100_000
let index: Promise<Map<string, UrbanCentre[]>> | undefined

async function loadIndex(): Promise<Map<string, UrbanCentre[]>> {
  const compressed = await readFile(path.join(process.cwd(), 'data/urban-centres.json.gz'))
  const data = JSON.parse(gunzipSync(compressed).toString('utf8')) as { cities: UrbanCentre[] }
  const cells = new Map<string, UrbanCentre[]>()
  for (const centre of data.cities) {
    const [west, south, east, north] = centre.bounds.map((value) => Math.floor(value / CELL_METRES))
    for (let x = west; x <= east; x++) {
      for (let y = south; y <= north; y++) {
        const key = `${x},${y}`
        const entries = cells.get(key)
        if (entries) entries.push(centre)
        else cells.set(key, [centre])
      }
    }
  }
  return cells
}

export async function findUrbanCentre(latitude: number, longitude: number): Promise<UrbanCentre | null> {
  if (!index)
    index = loadIndex().catch((error) => {
      index = undefined
      throw error
    })
  const cells = await index
  const [x, y] = projectToMollweide(latitude, longitude)
  const candidates = cells.get(`${Math.floor(x / CELL_METRES)},${Math.floor(y / CELL_METRES)}`) ?? []
  return candidates.find((centre) => containsPoint(centre, x, y)) ?? null
}
