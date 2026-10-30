import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomInt } from 'node:crypto'
import { randomPublishedMap } from './sharing-db'
import { validateSlug } from './slug'
import { loadLocalMap } from './local-map'

export async function pickExploreMap(
  exclude: string | null,
  visited: string[] = [],
  own: string | null = null,
): Promise<string | null> {
  if (process.env.NODE_ENV !== 'development' || process.env.VERCEL) return randomPublishedMap(exclude, visited, own)
  let rows: { slug: string }[]
  try {
    rows = JSON.parse(await readFile(join(process.cwd(), '.local-maps/index.json'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return randomPublishedMap(exclude, visited, own)
    throw error
  }
  const available: string[] = []
  for (const row of rows) {
    if (row.slug !== own && validateSlug(row.slug).ok && (await loadLocalMap(row.slug))) available.push(row.slug)
  }
  const others = available.filter((slug) => slug !== exclude)
  const unseen = others.filter((slug) => !visited.includes(slug))
  const candidates = unseen.length ? unseen : others.length ? others : available
  return candidates.length ? candidates[randomInt(candidates.length)] : null
}
