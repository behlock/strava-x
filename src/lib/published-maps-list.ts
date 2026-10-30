import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { listPublishedMaps as listDatabaseMaps, type PublishedMapSummary } from './sharing-db'
import type { MapsSort, MapsOrder } from './maps-sort'
import { validateSlug } from './slug'
import { loadLocalMap } from './local-map'
import { topRunningCity } from './top-running-city'

const localCities = new WeakMap<object, Promise<string | null>>()

export async function listPublishedMaps(
  offset: number,
  limit: number,
  sort: MapsSort = 'activities',
  order: MapsOrder = 'desc',
): Promise<PublishedMapSummary[]> {
  if (process.env.NODE_ENV !== 'development' || process.env.VERCEL) return listDatabaseMaps(offset, limit, sort, order)
  let rows: PublishedMapSummary[]
  try {
    rows = JSON.parse(await readFile(join(process.cwd(), '.local-maps/index.json'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return listDatabaseMaps(offset, limit, sort, order)
    throw error
  }
  if (!Array.isArray(rows) || rows.some((row) => !validateSlug(row.slug).ok || !Number.isFinite(row.activity_count)))
    throw new Error('invalid_local_map_index')
  const local: PublishedMapSummary[] = []
  for (const row of rows) {
    const map = await loadLocalMap(row.slug)
    if (!map) continue
    if (!localCities.has(map)) localCities.set(map, topRunningCity(map.activities))
    local.push({ slug: row.slug, activity_count: row.activity_count, city: await localCities.get(map) })
  }
  return local
    .sort((a, b) => {
      if (sort === 'city' && (!a.city || !b.city)) return a.city ? -1 : b.city ? 1 : a.slug.localeCompare(b.slug)
      const delta =
        sort === 'map'
          ? a.slug.localeCompare(b.slug)
          : sort === 'city'
            ? a.city!.localeCompare(b.city!)
            : a.activity_count - b.activity_count
      return (order === 'asc' ? delta : -delta) || a.slug.localeCompare(b.slug)
    })
    .slice(offset, offset + limit)
}
