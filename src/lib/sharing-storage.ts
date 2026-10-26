import { randomUUID } from 'node:crypto'
import { del, get, put } from '@vercel/blob'
import { acknowledgeCleanup, cleanupCandidates } from './sharing-db'

function privateToken(): string {
  const token = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN
  if (!token) throw new Error('sharing_not_configured')
  return token
}
export async function writePrivateSnapshot(athleteId: number, body: string): Promise<string> {
  const result = await put(`snapshots/${athleteId}/${randomUUID()}.json`, body, {
    access: 'private',
    token: privateToken(),
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: 'application/json',
  })
  return result.pathname
}
export async function readPrivateSnapshot(pathname: string) {
  return get(pathname, { access: 'private', token: privateToken() })
}
/** Best effort; rows are removed only after the storage deletion succeeds. */
export async function drainBlobCleanup() {
  for (const item of await cleanupCandidates()) {
    try {
      const token = item.store === 'private' ? privateToken() : process.env.BLOB_READ_WRITE_TOKEN
      if (!token) continue
      await del(item.pathname, { token })
      await acknowledgeCleanup(item.pathname)
    } catch {
      console.warn('[sharing] snapshot cleanup pending')
    }
  }
}
