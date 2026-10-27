import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { validateSlug } from '@/lib/slug'
import type { SerializedActivity } from '@/lib/activities-serialize'

interface LocalMap {
  version: 1
  updatedAt?: string
  activities: SerializedActivity[]
}

/** Opt-in, gitignored snapshots for local development. Never served on Vercel or in production. */
export async function loadLocalMap(slug: string): Promise<LocalMap | null> {
  if (process.env.NODE_ENV !== 'development' || process.env.VERCEL) return null
  const checked = validateSlug(slug)
  if (!checked.ok) return null
  try {
    const payload = JSON.parse(
      await readFile(join(process.cwd(), '.local-maps', `${checked.slug}.json`), 'utf8'),
    ) as LocalMap
    return payload.version === 1 && Array.isArray(payload.activities) ? payload : null
  } catch {
    return null
  }
}
