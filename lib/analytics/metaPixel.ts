// Meta Pixel helper — thin, defensive wrapper so call sites don't each
// need to re-check `window.fbq` existence. Mirrors the existing defensive
// pattern already used in app/lib/analytics.ts.

type FbqFunction = (command: string, eventName: string, params?: Record<string, unknown>) => void

/**
 * Fires the Meta "Lead" conversion event. Call this ONLY after a lead has
 * been successfully written to the database — never on button click, never
 * on validation failure, never after a failed insert.
 *
 * TODO(duplicate-detection): once Duplicate Detection is fully tested and
 * merged into main, this should only fire for a genuinely new lead
 * (action === "created" || "possible_duplicate" from /api/leads/submit),
 * not for a resubmission that updates an existing lead
 * (action === "updated_existing"). That distinction doesn't exist on this
 * branch yet, so for Phase 1 this fires on every successful insert.
 */
export function fireMetaLead(payload: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return
  const fbq = (window as unknown as { fbq?: FbqFunction }).fbq
  if (!fbq) return
  fbq("track", "Lead", payload)
}
