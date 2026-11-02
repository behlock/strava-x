/** Shared browser/server path rasteriser. Heat measures activities per pixel,
 * not recorded GPS points: repeated segments within one activity count once. */
export const HEAT_SIZE = 512
const PAD = 4
const SIZE = HEAT_SIZE + PAD * 2
const EXTENT = 4096

export interface HeatFilter {
  types: string[]
  cutoff: number | null
}
interface TileFeature {
  type: number
  geometry: number[][][] | number[][]
  tags?: Record<string, unknown> | null
}
export interface HeatTile {
  features: TileFeature[]
}

const LIGHT = [
  [192, 187, 198],
  [170, 164, 162],
  [137, 139, 131],
  [87, 86, 91],
]
const DARK = [
  [81, 77, 93],
  [128, 126, 131],
  [170, 169, 155],
  [221, 214, 200],
]

export function heatColor(count: number, dark: boolean): number[] {
  const ramp = dark ? DARK : LIGHT
  const heat = Math.min(1, Math.log2(Math.max(1, count)) / 4) * (ramp.length - 1)
  const i = Math.min(ramp.length - 2, Math.floor(heat))
  const t = heat - i
  return ramp[i].map((value, channel) => Math.round(value + (ramp[i + 1][channel] - value) * t))
}

/** Rasterise clipped vector tile geometry, including its buffer. A fixed transfer
 * curve and shared world pixel grid keep neighbouring tiles and filters stable. */
export function rasterizePathHeat(
  tile: HeatTile | null,
  filter: HeatFilter,
  dark = false,
): Uint8ClampedArray<ArrayBuffer> {
  const density = new Float32Array(SIZE * SIZE)
  const coverage = new Float32Array(SIZE * SIZE)
  const touched: number[] = []
  const activities = new Map<unknown, TileFeature[]>()
  for (const feature of tile?.features ?? []) {
    const p = feature.tags
    if (feature.type !== 2 || !p || !filter.types.includes(String(p.type))) continue
    if (filter.cutoff !== null && Number(p.dateTs) > filter.cutoff) continue
    const key = p.id ?? feature
    const group = activities.get(key) ?? []
    group.push(feature)
    activities.set(key, group)
  }
  const radius = 0.65
  let work = 0
  for (const features of activities.values()) {
    for (const feature of features) {
      for (const line of feature.geometry as number[][][]) {
        for (let i = 1; i < line.length; i++) {
          const ax = (line[i - 1][0] * HEAT_SIZE) / EXTENT + PAD
          const ay = (line[i - 1][1] * HEAT_SIZE) / EXTENT + PAD
          const bx = (line[i][0] * HEAT_SIZE) / EXTENT + PAD
          const by = (line[i][1] * HEAT_SIZE) / EXTENT + PAD
          if (![ax, ay, bx, by].every(Number.isFinite)) continue
          const dx = bx - ax,
            dy = by - ay
          const length2 = dx * dx + dy * dy
          if (!length2) continue
          // Walk along the line, testing only nearby pixels: O(length), not its bounding-box area.
          const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)))
          work += steps + 1
          if (work > 8_000_000) throw new Error('heat_tile_budget')
          for (let step = 0; step <= steps; step++) {
            const x = ax + (dx * step) / steps,
              y = ay + (dy * step) / steps
            for (let py = Math.max(0, Math.floor(y) - 1); py <= Math.min(SIZE - 1, Math.floor(y) + 1); py++) {
              for (let px = Math.max(0, Math.floor(x) - 1); px <= Math.min(SIZE - 1, Math.floor(x) + 1); px++) {
                const t = Math.max(0, Math.min(1, ((px + 0.5 - ax) * dx + (py + 0.5 - ay) * dy) / length2))
                const distance = Math.hypot(px + 0.5 - ax - t * dx, py + 0.5 - ay - t * dy)
                const value = Math.max(0, Math.min(1, radius + 0.5 - distance))
                const index = py * SIZE + px
                if (value > coverage[index]) {
                  if (!coverage[index]) touched.push(index)
                  coverage[index] = value
                }
              }
            }
          }
        }
      }
    }
    for (const index of touched) {
      density[index] += coverage[index]
      coverage[index] = 0
    }
    touched.length = 0
  }
  const rgba = new Uint8ClampedArray(HEAT_SIZE * HEAT_SIZE * 4)
  for (let y = 0; y < HEAT_SIZE; y++) {
    for (let x = 0; x < HEAT_SIZE; x++) {
      const count = density[(y + PAD) * SIZE + x + PAD]
      if (!count) continue
      const index = (y * HEAT_SIZE + x) * 4
      const rgb = heatColor(count, dark)
      rgba[index] = rgb[0]
      rgba[index + 1] = rgb[1]
      rgba[index + 2] = rgb[2]
      rgba[index + 3] = Math.round(255 * Math.min(1, count))
    }
  }
  return rgba
}

export interface HeatTileCoordinate {
  z: number
  x: number
  y: number
}
export function heatTileBounds({
  z,
  x,
  y,
}: HeatTileCoordinate): [[number, number], [number, number], [number, number], [number, number]] {
  const n = 2 ** z
  const latitude = (row: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI
  return [
    [(x / n) * 360 - 180, latitude(y)],
    [((x + 1) / n) * 360 - 180, latitude(y)],
    [((x + 1) / n) * 360 - 180, latitude(y + 1)],
    [(x / n) * 360 - 180, latitude(y + 1)],
  ]
}

/** A bounded viewport tile set; longitudes may exceed 180 for wrapped worlds. */
export function visibleHeatTiles(
  west: number,
  south: number,
  east: number,
  north: number,
  zoom: number,
): HeatTileCoordinate[] {
  let z = Math.max(0, Math.min(16, Math.floor(zoom)))
  if (east < west) east += 360
  const row = (lat: number, n: number) => {
    const r = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180
    return Math.max(0, Math.min(n - 1, Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n)))
  }
  for (;;) {
    const n = 2 ** z
    const x0 = Math.floor(((west + 180) / 360) * n),
      x1 = Math.floor(((east + 180) / 360) * n)
    const y0 = row(north, n),
      y1 = row(south, n)
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 48 && z > 0) {
      z--
      continue
    }
    const tiles: HeatTileCoordinate[] = []
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= Math.min(x1, x0 + 47); x++) tiles.push({ z, x, y })
    return tiles
  }
}
