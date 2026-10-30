import { personalRouteColor } from './comparison-paint'
import { DEFAULT_PERSONAL_PALETTE } from './comparison-appearance'
import type { SerializedActivity } from './activities-serialize'

export function renderMapThumbnail(activities: SerializedActivity[], isDark = false): string {
  const buckets = new Map<string, { count: number; lng: number; lat: number }>()
  for (const activity of activities) {
    const start = activity.feature?.geometry.coordinates[0]
    if (!start || !valid(start)) continue
    const [lng, lat] = start
    const key = `${Math.floor(lng * 10)},${Math.floor(lat * 10)}`
    const bucket = buckets.get(key) ?? { count: 0, lng: 0, lat: 0 }
    bucket.count++
    bucket.lng += lng
    bucket.lat += lat
    buckets.set(key, bucket)
  }
  const busiest = [...buckets.values()].sort((a, b) => b.count - a.count)[0]
  const paths: string[] = []
  if (busiest) {
    const lng = busiest.lng / busiest.count
    const lat = busiest.lat / busiest.count
    const cos = Math.max(0.05, Math.cos((lat * Math.PI) / 180))
    // A 24km-wide window keeps individual streets legible and distant trips out.
    const project = (point: number[]) => {
      const delta = ((point[0] - lng + 540) % 360) - 180
      return [320 + delta * cos * 111.32 * (640 / 24), 200 - (point[1] - lat) * 111.32 * (640 / 24)]
    }
    let vertices = 0
    const stride = Math.max(1, Math.ceil(activities.length / 800))
    for (let a = 0; a < activities.length && vertices < 60_000; a += stride) {
      const coordinates = activities[a].feature?.geometry.coordinates
      if (!coordinates?.length) continue
      let d = ''
      let penDown = false
      const step = Math.max(1, Math.ceil(coordinates.length / 200))
      for (let i = 0; i < coordinates.length && vertices < 60_000; i += step) {
        if (!valid(coordinates[i])) {
          penDown = false
          continue
        }
        const [x, y] = project(coordinates[i])
        if (x < -80 || x > 720 || y < -80 || y > 480) {
          penDown = false
          continue
        }
        d += `${penDown ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
        penDown = true
        vertices++
      }
      if (d) paths.push(`<path d="${d}"/>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><g fill="none" stroke="${personalRouteColor(DEFAULT_PERSONAL_PALETTE, isDark)}" stroke-width="0.7" stroke-opacity="0.7" stroke-linecap="round" stroke-linejoin="round">${paths.join('')}</g>${paths.length ? '' : '<text x="320" y="204" text-anchor="middle" fill="#aaa" font-family="monospace" font-size="14">no routes to preview</text>'}</svg>`
}

function valid(point: number[]): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90
}
