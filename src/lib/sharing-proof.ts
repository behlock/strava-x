import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

function secret(): string {
  const key = process.env.STRAVA_CLIENT_SECRET
  if (!key) throw new Error('sharing_not_configured')
  return key
}
export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
export function signProof(purpose: string, claims: object, expiresAt: number): string {
  const body = Buffer.from(JSON.stringify({ ...claims, expiresAt })).toString('base64url')
  const signature = createHmac('sha256', secret()).update(`${purpose}:${body}`).digest('base64url')
  return `${body}.${signature}`
}
export function readProof<T>(purpose: string, proof: unknown): (T & { expiresAt: number }) | null {
  if (typeof proof !== 'string' || proof.length > 4096) return null
  const [body, signature, extra] = proof.split('.')
  if (!body || !signature || extra) return null
  const expected = createHmac('sha256', secret()).update(`${purpose}:${body}`).digest()
  const supplied = Buffer.from(signature, 'base64url')
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return claims && Number.isFinite(claims.expiresAt) && claims.expiresAt > Date.now() ? claims : null
  } catch {
    return null
  }
}
export interface SnapshotProof {
  athleteId: number
  revision: string
  fingerprint: string
  policy: 1
}
export function hasSafeRouteGrant(proof: unknown, accessToken: string): boolean {
  const grant = readProof<{ token: string }>('route-access', proof)
  return grant?.token === digest(accessToken)
}

/** Only the scope returned by Strava's server-to-server exchange is trusted. */
export function safeRouteScope(scope: unknown): boolean {
  if (typeof scope !== 'string') return false
  const scopes = scope.split(/[ ,]+/)
  return scopes.includes('activity:read') && !scopes.includes('activity:read_all')
}
