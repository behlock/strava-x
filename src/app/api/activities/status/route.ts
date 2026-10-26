import { type NextRequest, NextResponse } from 'next/server'
import { authenticateAthlete, enforceRateLimit, isAccessToken, jsonError, readJsonBody } from '@/lib/api'
import { getActivityVersion } from '@/lib/activity-sync-db'
import { webhookSubscriptionId } from '@/lib/strava-webhook-config'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'activities-status', { windowMs: 60_000, max: 30 })
  if (limited) return limited
  const body = await readJsonBody<{ accessToken?: unknown }>(req)
  if (!isAccessToken(body?.accessToken)) return jsonError('missing_access_token')
  const auth = await authenticateAthlete(body.accessToken)
  if (!auth.ok) return jsonError(auth.error, auth.status)
  let version: string | null = null
  try {
    version = await getActivityVersion(auth.athlete.athleteId)
  } catch {
    // Missing tracking metadata must trigger a sync, never validate a stale cache.
  }
  return NextResponse.json(
    {
      athleteId: auth.athlete.athleteId,
      version,
      webhooksActive: webhookSubscriptionId() !== null,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
