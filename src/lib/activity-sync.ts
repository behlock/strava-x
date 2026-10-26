export interface ActivitySyncStamp {
  version: string | null
  syncedAt: number
  fingerprint?: string | null
}

export interface ActivitySyncStatus {
  athleteId: number
  version: string | null
  webhooksActive: boolean
}

const HOUR = 60 * 60_000

export function isActivityCacheFresh(
  cached: ActivitySyncStamp | null | undefined,
  status: ActivitySyncStatus,
  now = Date.now(),
): boolean {
  if (!cached || !Number.isFinite(cached.syncedAt)) return false
  const age = now - cached.syncedAt
  if (age < 0 || age >= (status.webhooksActive ? 24 * HOUR : HOUR)) return false
  return status.version !== null && cached.version === status.version
}
