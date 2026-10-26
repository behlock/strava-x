import { createHmac, timingSafeEqual } from 'node:crypto'

export function stravaWebhookToken(purpose: 'callback' | 'verify'): string {
  const secret = process.env.STRAVA_CLIENT_SECRET
  if (!secret) throw new Error('strava_not_configured')
  return createHmac('sha256', secret).update(`strava-x:webhook:${purpose}:v1`).digest('hex')
}

export function matchesWebhookToken(value: string | null, purpose: 'callback' | 'verify'): boolean {
  if (!value || !/^[a-f0-9]{64}$/.test(value) || !process.env.STRAVA_CLIENT_SECRET) return false
  return timingSafeEqual(Buffer.from(value), Buffer.from(stravaWebhookToken(purpose)))
}

export function webhookSubscriptionId(): number | null {
  const id = Number(process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
