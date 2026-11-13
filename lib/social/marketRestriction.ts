// PER-DESTINATION MARKET RESTRICTION — one answer to "may this destination carry this market?".
//
// Social Beast publishes to N destinations, each a social_connections row with its own provider,
// token, pause flag and cadence. A destination may be restricted to a set of markets: Locator
// Beast's accounts post Dallas content only, on Instagram and on TikTok, while Real Estate Pro's
// accounts keep drawing from every market.
//
// This module is PURE and PLATFORM-AGNOSTIC on purpose. It is the only place that decides what a
// restriction means, and it is consulted from three different layers:
//
//   planner        filters each destination's candidate pool BEFORE selection
//   publish worker re-checks the row immediately before publishing (Instagram and TikTok)
//   accounts page  renders the restriction so an operator can see it
//
// Three callers, one definition. A per-platform copy is how an Instagram guard and a TikTok guard
// come to disagree about whether "dallas" is Dallas.
//
// ── NULL IS UNRESTRICTED ────────────────────────────────────────────────────────────────────
// Every destination that predates this feature reads NULL and behaves exactly as before. That is
// the whole compatibility story: restriction is opt-in per row, so nothing can acquire one by
// default, by migration, or by a forgotten argument.
//
// ── AN EMPTY LIST IS ALSO UNRESTRICTED, NOT "NOTHING ALLOWED" ───────────────────────────────
// `[]` is what a cleared UI field, a stripped JSON body or an over-eager filter produces. Reading
// it as "no market may be published" would silently stop a working account, and a silent stop is
// the failure mode hardest to notice. Reading it as "unrestricted" is the status quo, which is
// visible and recoverable. "Only Dallas" is always spelled explicitly.

/** NULL / absent ⇒ unrestricted. A non-empty list ⇒ only those markets. */
export type MarketRestriction = readonly string[] | null

/**
 * Normalise anything the database or an HTTP body might hand us into a restriction.
 *
 * Accepts a text[] from PostgREST, a JSON array from a request, or a single string (a body that
 * sends one market unwrapped). Everything else — a number, an object, a boolean — is UNRESTRICTED
 * rather than an error: this is called on the publish path, and throwing there would turn a
 * malformed cell into a failed post. The database CHECK is what keeps the column itself clean.
 */
export function parseMarketRestriction(raw: unknown): string[] | null {
  const list = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : null
  if (!list) return null
  const clean = [...new Set(
    list.filter((m): m is string => typeof m === "string").map((m) => m.trim()).filter(Boolean),
  )]
  return clean.length ? clean : null
}

/**
 * THE COMPARISON. Trimmed and case-insensitive, nothing more.
 *
 * Markets are free text stored verbatim (lib/social/markets.ts) and typed by hand in two different
 * places — the content form and this restriction — so "dallas" vs "Dallas" is a realistic typo and
 * one that would silently empty a destination's pool. Case is therefore ignored.
 *
 * NOTHING ELSE is normalised. Dallas and DFW are DISTINCT market labels that the catalog
 * deliberately never merges, and they differ by more than case, so a Dallas-only destination is
 * NOT offered DFW content. A brand that should carry both lists both — which is exactly why the
 * restriction is a list rather than a single value.
 */
function sameMarket(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * May this destination carry content from this market?
 *
 * A BLANK MARKET IS REFUSED under a restriction. A content row with no market cannot be shown to
 * be Dallas, and "we could not tell" must never resolve to "publish it". Unrestricted
 * destinations are unaffected — they take a blank market exactly as they do today.
 */
export function isMarketAllowed(restriction: MarketRestriction, market: string | null | undefined): boolean {
  const allowed = parseMarketRestriction(restriction)
  if (!allowed) return true
  const m = (market ?? "").trim()
  if (!m) return false
  return allowed.some((a) => sameMarket(a, m))
}

/**
 * The reason this post may not go out on this destination, or null when it may.
 *
 * Returns prose rather than a boolean because the publish workers write it into
 * social_posts.error_message, where a human reads it. "market_mismatch" would tell them nothing
 * about which market or which restriction.
 */
export function marketRestrictionViolation(
  restriction: MarketRestriction,
  market: string | null | undefined,
): string | null {
  const allowed = parseMarketRestriction(restriction)
  if (!allowed) return null
  if (isMarketAllowed(allowed, market)) return null
  const m = (market ?? "").trim()
  const only = allowed.join(", ")
  return m
    ? `this destination publishes ${only} only — this post's market is ${m}. Reassign it to another destination.`
    : `this destination publishes ${only} only — this post's content has no market set, so it cannot be shown to be ${only}.`
}

/** "Dallas only" / "Dallas, DFW only" / null when unrestricted. For display, never for a decision. */
export function marketRestrictionLabel(restriction: MarketRestriction): string | null {
  const allowed = parseMarketRestriction(restriction)
  return allowed ? `${allowed.join(", ")} only` : null
}
