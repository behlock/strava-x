const MAX_STRAVA_ID = '9223372036854775807'

/** Canonical positive int64 IDs. Never stringify an already-rounded number. */
export function normalizeStravaId(value: unknown): string | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value)) return null
  return value.length < MAX_STRAVA_ID.length || value <= MAX_STRAVA_ID ? value : null
}

/** id_str is authoritative; numeric fallback supports older API responses. */
export function stravaObjectId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const object = value as { id?: unknown; id_str?: unknown }
  if (object.id_str !== undefined) return typeof object.id_str === 'string' ? normalizeStravaId(object.id_str) : null
  return typeof object.id === 'number' ? normalizeStravaId(object.id) : null
}

/** Accept old server responses while keeping all client-side identities strings. */
export function normalizeAthleteId<T extends { athleteId: unknown }>(value: T): T & { athleteId: string } {
  const athleteId = normalizeStravaId(value.athleteId)
  if (!athleteId) throw new Error('invalid_athlete_id')
  return { ...value, athleteId }
}

/** Keep already-open older clients working for existing, safely numeric IDs.
 * New clients normalize either wire representation to strings immediately.
 */
export function athleteIdForJson<T extends { athleteId: string }>(value: T) {
  const id = normalizeStravaId(value.athleteId)
  if (!id) throw new Error('invalid_athlete_id')
  return { ...value, athleteId: BigInt(id) <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(id) : id }
}
