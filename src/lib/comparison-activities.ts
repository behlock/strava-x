import { loadActivities } from '@/lib/activities-db'
import { deserializeActivities, type SerializedActivity } from '@/lib/activities-serialize'
import { isActivityCacheFresh, type ActivitySyncStatus } from '@/lib/activity-sync'
import type { Activity } from '@/models/activity'

/** Verify the session's account before reading its cache. */
export async function loadComparisonActivities(accessToken: string, signal: AbortSignal): Promise<Activity[]> {
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
    signal,
  }
  const statusResponse = await fetch('/api/activities/status', options)
  if (statusResponse.status === 401) throw new Error('strava_unauthorized')
  const status: ActivitySyncStatus | null = statusResponse.ok ? await statusResponse.json() : null
  if (status) {
    const cached = await loadActivities(status.athleteId)
    signal.throwIfAborted()
    if (cached && isActivityCacheFresh(cached.sync, status)) return cached.activities
  }
  const response = await fetch('/api/activities/sync', options)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? 'sync_failed')
  }
  const result = (await response.json()) as { athleteId: number; activities: SerializedActivity[] }
  signal.throwIfAborted()
  if (status && result.athleteId !== status.athleteId) throw new Error('strava_unauthorized')
  return deserializeActivities(result.activities)
}
