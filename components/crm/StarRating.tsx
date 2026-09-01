import { starFillPercent } from "@bc/companion-shared"

/**
 * Compact five-star visual whose gold fill reflects the decimal rating, using the
 * SAME shared starFillPercent math as the Beast Companion. Presentational only —
 * the caller renders the numeric value beside it. Reused by the Explorer property
 * card, Best Matches (Recommendations), and Favorite Properties so the star math
 * is defined in exactly one place.
 */
export function StarRating({ value }: { value: number }) {
  const pct = starFillPercent(value)
  return (
    <span
      className="relative inline-block align-middle leading-none"
      title={`${value.toFixed(1)} out of 5`}
      aria-label={`Google rating ${value.toFixed(1)} out of 5`}
    >
      <span className="block whitespace-nowrap text-[13px] tracking-[1px] text-[#d7dbe4]">★★★★★</span>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap text-[13px] tracking-[1px] text-[#f5a623]"
        style={{ width: `${pct}%` }}
      >
        ★★★★★
      </span>
    </span>
  )
}
