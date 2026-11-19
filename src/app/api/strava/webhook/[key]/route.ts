import { createHash } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { jsonError, readBoundedBody } from '@/lib/api'
import { recordActivityChange } from '@/lib/activity-sync-db'
import { matchesWebhookToken, webhookSubscriptionId } from '@/lib/strava-webhook-config'
import { parseStravaWebhookJson } from '@/lib/strava-webhook-json'
import { normalizeStravaId } from '@/lib/strava-id'

export const runtime = 'nodejs'

type WebhookContext = { params: Promise<{ key: string }> }

export async function GET(req: NextRequest, { params: routeParams }: WebhookContext) {
  const { key } = await routeParams
  const params = new URL(req.url).searchParams
  const challenge = params.get('hub.challenge')
  if (
    !matchesWebhookToken(key, 'callback') ||
    !matchesWebhookToken(params.get('hub.verify_token'), 'verify') ||
    params.get('hub.mode') !== 'subscribe' ||
    !challenge ||
    challenge.length > 256
  ) {
    return jsonError('invalid_webhook_verification', 403)
  }
  return NextResponse.json({ 'hub.challenge': challenge }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest, { params }: WebhookContext) {
  const { key } = await params
  if (!matchesWebhookToken(key, 'callback')) {
    return jsonError('invalid_webhook_token', 403)
  }
  const subscriptionId = webhookSubscriptionId()
  if (subscriptionId === null) return jsonError('webhook_not_configured', 503)
  let event: {
    owner_id?: unknown
    object_id?: unknown
    event_time?: unknown
    subscription_id?: unknown
    object_type?: unknown
    aspect_type?: unknown
    updates?: Record<string, unknown>
  } | null
  try {
    const body = await readBoundedBody(req, 64 * 1024)
    event = body ? (parseStravaWebhookJson(body.toString('utf8')) as typeof event) : null
  } catch {
    event = null
  }
  const ownerId = normalizeStravaId(event?.owner_id)
  const objectId = normalizeStravaId(event?.object_id)
  if (
    !event ||
    event.subscription_id !== subscriptionId ||
    !ownerId ||
    !objectId ||
    !Number.isSafeInteger(event.event_time) ||
    Number(event.event_time) <= 0 ||
    !['create', 'update', 'delete'].includes(String(event.aspect_type)) ||
    !['activity', 'athlete'].includes(String(event.object_type)) ||
    (event.updates !== undefined &&
      (!event.updates || typeof event.updates !== 'object' || Array.isArray(event.updates)))
  )
    return jsonError('invalid_webhook_event')
  const revoked = event.object_type === 'athlete' && event.updates?.authorized === 'false'
  const keys = Object.keys(event.updates ?? {})
  const titleOnly = event.aspect_type === 'update' && keys.length === 1 && keys[0] === 'title'
  // Do not serve deleted/restricted routes while waiting for the owner to
  // return. Preserve the address and sharing intent for their next full sync.
  const invalidateSnapshot =
    event.object_type === 'activity' &&
    (event.aspect_type === 'delete' || keys.some((key) => key === 'private' || key === 'visibility'))
  if ((event.object_type === 'activity' && !titleOnly) || revoked) {
    const key = createHash('sha256')
      .update(
        JSON.stringify([
          event.object_type,
          // Keep existing retry keys stable for IDs handled by older releases.
          BigInt(objectId) <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(objectId) : objectId,
          event.aspect_type,
          event.event_time,
          Object.entries(event.updates ?? {}).sort(([a], [b]) => a.localeCompare(b)),
        ]),
      )
      .digest('hex')
    try {
      await recordActivityChange(ownerId, key, revoked, invalidateSnapshot)
    } catch {
      return jsonError('webhook_unavailable', 503)
    }
  }
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
