import { normalizeStravaId } from './strava-id'

/**
 * Webhooks still send numeric IDs. Node 22+ exposes their original JSON token
 * to the reviver, before precision is lost. Older runtimes fail closed on
 * unsafe numbers. Do not replace this with request.json() or String(value).
 */
export function parseStravaWebhookJson(text: string): unknown {
  return JSON.parse(text, (key, value, context?: { source?: string }) => {
    if (key !== 'owner_id' && key !== 'object_id') return value
    return typeof value === 'number' ? normalizeStravaId(context?.source ?? value) : null
  })
}
