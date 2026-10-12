// SIGNING MEDIA URLS: the one place that decides what a signed URL is worth re-using, and what a
// FAILURE to produce one means.
//
// ── THE BUG THIS EXISTS TO END ──────────────────────────────────────────────────────────────────
// Routes used to do `(await createSignedUrl(p, TTL)).data?.signedUrl ?? null`. That turns a
// transient failure into exactly the same value as "this post has no video", so the Post Editor
// printed "No preview" — a dead end with no retry — for a clip sitting safely in storage. The
// failure is real and reproducible: createSignedUrl returns `Too many connections issued to the
// database` under load. Measured across repeated 142-signing runs, failures appeared at every
// concurrency tried, so this is treated as an expected intermittent condition, not an edge case.
//
// So the result is a THREE-state value. "absent" and "failed" can never be confused again.
//
// ── WHY THE CACHE IS SAFE ───────────────────────────────────────────────────────────────────────
// A signed URL is a bearer token. Re-using one is only safe under conditions this module enforces:
//   • keyed by OWNER + PATH, so a URL signed for one account can never be handed to another;
//   • held in this server instance's own memory — never shared between Vercel instances, so there
//     is no shared cache to poison and no cross-instance leak. A second instance simply signs its
//     own copy. (It carries no "server-only" guard so it stays unit-testable; the invariant that
//     no client component imports it is asserted in scripts/social/signedMedia.test.ts instead.
//     Even bundled into a browser it could leak nothing — a Map in one user's own tab, holding
//     URLs that tab already received);
//   • evicted BEFORE the token expires (25 min cache vs a 30 min token), so a cached URL is never
//     handed out close enough to expiry to die in the player;
//   • bounded, so a large library cannot grow it without limit.
// It does NOT grant access: every caller still runs its own auth guard first, and the URL still
// expires. Nothing here creates a permanent or public URL.
import type { SupabaseClient } from "@supabase/supabase-js"

export const SIGN_TTL_SECONDS = 60 * 30
// Deliberately shorter than the token: a URL handed out at 24:59 still has ~5 minutes of life.
const CACHE_TTL_MS = 25 * 60 * 1000
const MAX_ENTRIES = 2000
/** Measured median signing latency is ~126ms; one short retry costs little and recovers the
 *  intermittent pool failures that caused "No preview". */
const RETRY_DELAY_MS = 120

export type SignedMedia =
  /** A usable URL. */
  | { status: "ok"; url: string }
  /** There is genuinely no object to sign — no source, no rendered artifact, no thumbnail. */
  | { status: "absent"; url: null }
  /** An object exists but signing failed. The caller must say so; it must NOT render as "missing". */
  | { status: "failed"; url: null }

type Entry = { url: string; expiresAt: number }
const cache = new Map<string, Entry>()

const keyFor = (ownerUserId: string, path: string) => `${ownerUserId}\u0000${path}`

/** Visible for tests: drop everything (or one owner's entries). */
export function clearSignedMediaCache(ownerUserId?: string): void {
  if (!ownerUserId) return void cache.clear()
  for (const k of [...cache.keys()]) if (k.startsWith(`${ownerUserId}\u0000`)) cache.delete(k)
}

export function signedMediaCacheSize(): number {
  return cache.size
}

/**
 * Sign `path` for `ownerUserId`, re-using a still-valid URL when one was already issued.
 *
 * Retries ONCE before reporting failure, because the observed failure mode is transient pool
 * pressure rather than a missing object.
 */
export async function signMedia(
  supabase: SupabaseClient,
  path: string | null | undefined,
  ownerUserId: string,
  now: number = Date.now(),
): Promise<SignedMedia> {
  if (!path) return { status: "absent", url: null }

  const key = keyFor(ownerUserId, path)
  const hit = cache.get(key)
  if (hit && hit.expiresAt > now) return { status: "ok", url: hit.url }
  if (hit) cache.delete(key) // expired — never hand out a URL close to its token's death

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data } = await supabase.storage.from("social-media").createSignedUrl(path, SIGN_TTL_SECONDS)
    const url = data?.signedUrl
    if (url) {
      if (cache.size >= MAX_ENTRIES) {
        // Oldest-inserted first; Map preserves insertion order.
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      cache.set(key, { url, expiresAt: now + CACHE_TTL_MS })
      return { status: "ok", url }
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
  }
  return { status: "failed", url: null }
}

/**
 * Map with a concurrency ceiling.
 *
 * Replaces unbounded `Promise.all` over a whole library: one page load used to fire 284 signing
 * requests at once. The ceiling is deliberately NOT small — measured runs showed low concurrency is
 * markedly SLOWER without being more reliable, so this bounds the burst without serialising it.
 * Order of results matches the input.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

/** Burst ceiling for list routes that sign many objects at once. */
export const SIGN_CONCURRENCY = 12
