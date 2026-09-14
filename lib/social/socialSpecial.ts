// Beast Social — the per-post "Social Special": a short, public-facing promotional value chosen for
// one post, kept SEPARATE from the raw Current Special (factual source metadata, never overwritten).
// Standardized options keep overlays/captions short and consistent; a Gift Card option takes an
// optional amount; a Custom option allows concise property-specific promos (wording preserved,
// never AI-rewritten). Numbers are numeric ("8 Weeks Free", not "Eight Weeks Free").

/** Standardized short-form options offered in the selector (Gift Card + Custom handled specially). */
export const SOCIAL_SPECIAL_OPTIONS: readonly string[] = [
  "1 Week Free",
  "2 Weeks Free",
  "4 Weeks Free",
  "6 Weeks Free",
  "8 Weeks Free",
  "1 Month Free",
  "2 Months Free",
  "Free Movers",
] as const

/** Gift Card display value. A positive amount → "$500 Gift Card" / "$1,000 Gift Card"; no/invalid
 *  amount → "Gift Card" (never invents an amount). */
export function giftCardLabel(amount: string | number | null | undefined): string {
  const digits = String(amount ?? "").replace(/[^\d]/g, "")
  const n = digits ? parseInt(digits, 10) : NaN
  return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString("en-US")} Gift Card` : "Gift Card"
}

/** Is this stored value a Gift Card special (with or without an amount)? */
export function isGiftCardSpecial(value: string | null | undefined): boolean {
  return /(^|\s)gift card$/i.test((value ?? "").trim())
}

/** Trim + collapse a custom promo; cap length; never rewrite wording. "" for empty. */
export function sanitizeCustomSpecial(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 60)
}
