import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { validateSlug } from '@/lib/slug'
import type { SerializedActivity } from '@/lib/activities-serialize'

interface LocalMap {
  version: 1
  updatedAt?: string
  activities: SerializedActivity[]
}

const localCache = new Map<string, { signature: string; payload: LocalMap }>()

/** Opt-in, gitignored snapshots for local development. Never served on Vercel or in production. */
export async function loadLocalMap(slug: string): Promise<LocalMap | null> {
  if (process.env.NODE_ENV !== 'development' || process.env.VERCEL) return null
  const checked = validateSlug(slug)
  if (!checked.ok) return null
  try {
    const path = join(process.cwd(), '.local-maps', `${checked.slug}.json`)
    const info = await stat(path)
    const signature = `${info.mtimeMs}:${info.size}`
    const hit = localCache.get(path)
    if (hit?.signature === signature) return hit.payload
    const payload = JSON.parse(await readFile(path, 'utf8')) as LocalMap
    if (payload.version !== 1 || !Array.isArray(payload.activities)) return null
    if (localCache.size >= 2) localCache.delete(localCache.keys().next().value!)
    localCache.set(path, { signature, payload })
    return payload
  } catch {
    return null
  }
}
