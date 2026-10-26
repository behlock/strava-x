// Best-effort per-instance rate limit, not a distributed quota.

interface Bucket {
  count: number
  expiresAt: number
}

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 5000

export interface RateLimitOptions {
  windowMs: number
  max: number
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number }

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || bucket.expiresAt <= now) {
    bucket = { count: 0, expiresAt: now + opts.windowMs }
    buckets.set(key, bucket)
  }
  bucket.count++

  if (buckets.size > MAX_BUCKETS) {
    for (const [key, entry] of buckets) if (entry.expiresAt <= now) buckets.delete(key)
    while (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value!)
  }

  if (bucket.count > opts.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000))
    return { ok: false, retryAfterSeconds }
  }
  return { ok: true }
}

export function clientKey(req: Request, prefix: string): string {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown'
  return `${prefix}:${ip.slice(0, 64)}`
}
