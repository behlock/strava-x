// Per-instance fixed-window rate limiter. On Fluid Compute this state lives
// inside each function instance, so the actual ceiling is (max * instances).
// That's an intentional trade-off: avoids adding an external dependency for
// what is otherwise abuse protection, not strict accounting.

interface Bucket {
  count: number
  windowStart: number
}

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 5000

export interface RateLimitOptions {
  windowMs: number
  max: number
}

export interface RateLimitResult {
  ok: boolean
  retryAfterSeconds?: number
}

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStart > opts.windowMs) {
    bucket = { count: 0, windowStart: now }
    buckets.set(key, bucket)
  }
  bucket.count++

  if (buckets.size > MAX_BUCKETS) {
    for (const k of Array.from(buckets.keys())) {
      const b = buckets.get(k)
      if (b && now - b.windowStart > opts.windowMs) buckets.delete(k)
      if (buckets.size <= MAX_BUCKETS / 2) break
    }
  }

  if (bucket.count > opts.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((opts.windowMs - (now - bucket.windowStart)) / 1000))
    return { ok: false, retryAfterSeconds }
  }
  return { ok: true }
}

export function clientKey(req: Request, prefix: string): string {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown'
  return `${prefix}:${ip}`
}

export function tooManyRequests(retryAfterSeconds: number) {
  return new Response(JSON.stringify({ error: 'rate_limited' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfterSeconds),
    },
  })
}
