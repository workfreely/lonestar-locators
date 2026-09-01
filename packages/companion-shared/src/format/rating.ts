/**
 * Shared Google-rating display math, so the CRM property card and the Beast
 * Companion Current Property card compute the five-star fill IDENTICALLY —
 * neither surface re-invents slightly different star math. ONLY the math lives
 * here; each surface styles the stars with its own CSS (the CRM uses Tailwind,
 * the extension its own panel CSS behind a Shadow DOM).
 */

/**
 * The gold-fill width, as a percentage of the full five-star row, for a rating
 * on the 0–5 scale. Clamped to [0,100] so a partial fifth star reflects the
 * decimal — e.g. 4.3 → 86, 5 → 100, 0 → 0.
 */
export function starFillPercent(value: number): number {
  return Math.max(0, Math.min(100, (value / 5) * 100))
}

/** The rating shown numerically, one decimal place (e.g. 4.3). */
export function formatRating(value: number): string {
  return value.toFixed(1)
}
