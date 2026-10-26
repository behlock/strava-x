import { stravaWebhookToken } from '../src/lib/strava-webhook-config.ts'

const origin = new URL(process.argv[2] || process.env.NEXT_PUBLIC_APP_URL || 'https://www.strava-x.com')
if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('An HTTPS app URL is required')
const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID
const clientSecret = process.env.STRAVA_CLIENT_SECRET
if (!clientId || !clientSecret) throw new Error('Strava credentials are missing')

const callback = new URL('/api/strava/webhook', origin)
callback.searchParams.set('key', stravaWebhookToken('callback'))
const credentials = new URLSearchParams({ client_id: clientId, client_secret: clientSecret })
const endpoint = 'https://www.strava.com/api/v3/push_subscriptions'
const existing = await fetch(`${endpoint}?${credentials}`, { signal: AbortSignal.timeout(15_000) })
if (!existing.ok) throw new Error(`Could not read Strava subscriptions (${existing.status})`)
const subscriptions = await existing.json()
if (!Array.isArray(subscriptions)) throw new Error('Invalid Strava subscription response')
let id = subscriptions.find((subscription) => subscription.callback_url === callback.href)?.id
if (!id && subscriptions.length) throw new Error('This Strava app already has a different webhook; leave it intact')
if (!id) {
  const response = await fetch(endpoint, {
    method: 'POST',
    body: new URLSearchParams({
      ...Object.fromEntries(credentials),
      callback_url: callback.href,
      verify_token: stravaWebhookToken('verify'),
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok)
    throw new Error(`Could not create Strava subscription (${response.status}); deploy the callback first`)
  id = (await response.json()).id
}
if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid Strava subscription ID')
console.log(`STRAVA_WEBHOOK_SUBSCRIPTION_ID=${id}`)
