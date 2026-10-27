import type { SerializedActivity } from '@/lib/activities-serialize'
import type { ActivitySyncStamp } from '@/lib/activity-sync'
import type { ShareState, VerifiedSnapshot } from '@/lib/share-snapshot'

export interface ActivitySyncResult {
  athleteId: number
  activities: SerializedActivity[]
  snapshot: VerifiedSnapshot | null
  share: ShareState | null
  sync: ActivitySyncStamp
}

export type ActivitySyncEvent =
  | { type: 'start'; athleteId: number }
  | { type: 'batch'; activities: SerializedActivity[] }
  | { type: 'complete'; result: Omit<ActivitySyncResult, 'activities'>; count: number }
  | { type: 'error'; error: string }

/** Preview batches are provisional until a complete event and a clean end of stream. */
export async function readActivitySync(
  response: Response,
  signal: AbortSignal,
  onBatch: (athleteId: number, activities: SerializedActivity[]) => void,
): Promise<ActivitySyncResult> {
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? 'sync_failed')
  }
  if (!response.headers.get('Content-Type')?.includes('application/x-ndjson')) {
    const result = (await response.json()) as ActivitySyncResult
    signal.throwIfAborted()
    return result
  }
  if (!response.body) throw new Error('sync_failed')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  const activities = new Map<string, SerializedActivity>()
  let athleteId: number | undefined
  let complete: ActivitySyncResult | undefined
  let pending = ''
  const abort = () => {
    void reader.cancel().catch(() => {})
  }
  signal.addEventListener('abort', abort, { once: true })
  const consume = (line: string) => {
    signal.throwIfAborted()
    const event = JSON.parse(line) as ActivitySyncEvent
    if (complete) throw new Error('sync_failed')
    switch (event.type) {
      case 'start':
        if (athleteId !== undefined || !Number.isSafeInteger(event.athleteId) || event.athleteId <= 0)
          throw new Error('sync_failed')
        athleteId = event.athleteId
        break
      case 'batch':
        if (athleteId === undefined || !Array.isArray(event.activities)) throw new Error('sync_failed')
        for (const activity of event.activities) activities.set(activity.id, activity)
        onBatch(athleteId, event.activities)
        break
      case 'complete':
        if (athleteId === undefined || event.result.athleteId !== athleteId || event.count !== activities.size)
          throw new Error('sync_failed')
        complete = { ...event.result, activities: [...activities.values()] }
        break
      case 'error':
        throw new Error(event.error)
      default:
        throw new Error('sync_failed')
    }
  }
  try {
    while (true) {
      signal.throwIfAborted()
      const { value, done } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      pending += value
      let newline: number
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline)
        pending = pending.slice(newline + 1)
        if (line) consume(line)
      }
    }
    if (pending) consume(pending)
    if (!complete) throw new Error('sync_failed')
    return complete
  } finally {
    signal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
