// Best-effort in-memory fixed-window rate limiter.
//
// NOTE: state lives in the module scope of a single serverless instance, so on
// Vercel it is per-instance, not global — it raises the bar against casual
// abuse/bursts but is not a hard guarantee. A durable limiter (Upstash/Redis)
// is the Phase-2 upgrade if we need cross-instance enforcement. Kept dependency
// -free and synchronous so it can guard public routes without extra infra.

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

/**
 * Returns whether `key` is allowed another hit under `limit` requests per
 * `windowMs`. Counts the current request when allowed.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: limit - 1, resetAt, retryAfterSeconds: 0 }
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  return {
    allowed: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
    retryAfterSeconds: 0,
  }
}

/**
 * Extracts the best-available client IP from a request's proxy headers.
 * Falls back to "unknown" so a missing header degrades to a single shared
 * bucket rather than throwing.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    // May be a comma-separated list; the first entry is the origin client.
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return headers.get("x-real-ip")?.trim() || "unknown"
}
