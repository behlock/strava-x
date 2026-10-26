import { createHash } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { jsonError, readJsonBody } from '@/lib/api'
import { recordActivityChange } from '@/lib/activity-sync-db'
import { matchesWebhookToken, webhookSubscriptionId } from '@/lib/strava-webhook-config'

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
  const event = await readJsonBody<{
    owner_id?: unknown
    object_id?: unknown
    event_time?: unknown
    subscription_id?: unknown
    object_type?: unknown
    aspect_type?: unknown
    updates?: Record<string, unknown>
  }>(req)
  if (
    !event ||
    event.subscription_id !== subscriptionId ||
    !Number.isSafeInteger(event.owner_id) ||
    Number(event.owner_id) <= 0 ||
    !Number.isSafeInteger(event.object_id) ||
    Number(event.object_id) <= 0 ||
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
  if ((event.object_type === 'activity' && !titleOnly) || revoked) {
    const key = createHash('sha256')
      .update(
        JSON.stringify([
          event.object_type,
          event.object_id,
          event.aspect_type,
          event.event_time,
          Object.entries(event.updates ?? {}).sort(([a], [b]) => a.localeCompare(b)),
        ]),
      )
      .digest('hex')
    try {
      await recordActivityChange(Number(event.owner_id), key, revoked)
    } catch {
      return jsonError('webhook_unavailable', 503)
    }
  }
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
