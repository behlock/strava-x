import { topRunningCity } from './top-running-city'
import type { ShareRow, ShareWrite } from './sharing-db'
import { canonicalSnapshot } from './share-snapshot'
import { digest, readProof, type SnapshotProof } from './sharing-proof'

export class SharingError extends Error {
  constructor(code: string) {
    super(code)
  }
}
export interface SharingStore {
  read: (athleteId: number) => Promise<ShareRow>
  commit: (expected: ShareRow, next: ShareWrite) => Promise<ShareRow | null>
  upload: (athleteId: number, body: string) => Promise<string>
  discard: (path: string) => Promise<void>
}
interface Mutation {
  athleteId: number
  displayName: string | null
  revision: string
  action: 'create' | 'update' | 'rename' | 'stop'
  slug?: string
  activities?: unknown
  proof?: unknown
}
function existingValues(row: ShareRow): ShareWrite {
  return {
    slug: row.slug,
    active: row.active,
    displayName: row.athlete_display_name,
    snapshotPath: row.snapshot_path,
    fingerprint: row.fingerprint,
    activityCount: row.activity_count,
    sizeBytes: row.size_bytes,
    updatedAt: row.updated_at,
    topCity: row.top_city ?? null,
  }
}

export async function mutateShare(store: SharingStore, input: Mutation): Promise<ShareRow> {
  if (input.action === 'create' && !input.slug) throw new SharingError('invalid_slug')
  const current = await store.read(input.athleteId)
  if (current.revision !== input.revision) throw new SharingError('publication_changed')
  const next = existingValues(current)
  if (input.action === 'stop') {
    Object.assign(next, {
      active: false,
      slug: null,
      snapshotPath: null,
      fingerprint: null,
      activityCount: 0,
      sizeBytes: 0,
      topCity: null,
    })
  } else if (input.action === 'rename') {
    if (!current.active || !input.slug) throw new SharingError('publication_changed')
    next.slug = input.slug
  } else {
    if (input.action === 'update' && !current.active) throw new SharingError('publication_changed')
    if (input.action === 'create' && current.active) throw new SharingError('publication_changed')
    const proof = readProof<SnapshotProof>('snapshot', input.proof)
    if (!proof || proof.policy !== 1 || proof.athleteId !== input.athleteId || proof.revision !== current.revision) {
      throw new SharingError('sync_required')
    }
    // The signed hash alone proves an unchanged update; don't retransmit or
    // reserialize a large library just to confirm that nothing changed.
    if (current.active && current.snapshot_path && current.fingerprint === proof.fingerprint) {
      const saved = await store.commit(current, next)
      if (!saved) throw new SharingError('publication_changed')
      return saved
    }
    const canonical = canonicalSnapshot(input.activities)
    if (Buffer.byteLength(canonical) > 25 * 1024 * 1024) throw new SharingError('payload_too_large')
    const fingerprint = digest(canonical)
    if (proof.fingerprint !== fingerprint) throw new SharingError('invalid_snapshot')
    const topCity = await topRunningCity(JSON.parse(canonical))
    const updatedAt = new Date().toISOString()
    const body = `{"version":1,"updatedAt":${JSON.stringify(updatedAt)},"activities":${canonical}}`
    const snapshotPath = await store.upload(input.athleteId, body)
    Object.assign(next, {
      active: true,
      slug: input.action === 'update' ? current.slug : input.slug,
      snapshotPath,
      fingerprint,
      topCity,
      updatedAt,
      activityCount: (input.activities as unknown[]).length,
      displayName: input.displayName,
      sizeBytes: Buffer.byteLength(body),
    })
    try {
      const saved = await store.commit(current, next)
      if (!saved) throw new SharingError('publication_changed')
      return saved
    } catch (error) {
      // Only a definite rejected CAS can discard immediately. On an ambiguous
      // DB/network failure the write may have committed; keep the private file.
      if (error instanceof SharingError || (error as { code?: string })?.code === '23505') {
        await store.discard(snapshotPath).catch(() => {})
      }
      throw error
    }
  }
  const saved = await store.commit(current, next)
  if (!saved) throw new SharingError('publication_changed')
  return saved
}
