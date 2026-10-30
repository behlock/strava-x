import type { SerializedActivity } from './activities-serialize'
import { findUrbanCentre } from './urban-centres'

export async function topRunningCity(activities: SerializedActivity[]): Promise<string | null> {
  const counts = new Map<number, { name: string; count: number }>()
  for (const activity of activities) {
    if (activity.type !== 'running') continue
    const point = activity.feature?.geometry.coordinates[0]
    if (
      !point ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1]) ||
      Math.abs(point[0]) > 180 ||
      Math.abs(point[1]) > 90
    )
      continue
    const city = await findUrbanCentre(point[1], point[0])
    if (!city) continue
    const entry = counts.get(city.id) ?? { name: city.name, count: 0 }
    entry.count++
    counts.set(city.id, entry)
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0]?.name ?? null
}
