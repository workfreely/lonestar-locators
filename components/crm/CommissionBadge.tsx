import type { ReactNode } from "react"
import type { CommissionStatus } from "@bc/companion-shared"

/**
 * COMMISSION BADGE — what a locator is paid, on a property card.
 *
 * Three states, and the distinction between them is the whole point:
 *
 *   paying       a verified rate or bonus          dark green
 *   not_paying   somebody checked, and it is none  red
 *   unverified   NOBODY HAS CHECKED                neutral grey
 *
 * Unknown is not No. The grey pill says "Commission Not Verified", never "Not Paying" — an
 * absence of information must not read as a confirmed zero, which is the same rule the writer
 * enforces for a null send_commission.
 *
 * ── WHY THE PAYING PILL IS DARK ─────────────────────────────────────────────────────────────
 * It used to be a soft mint green, the same family as the move-in special beside it, so the two
 * read as one kind of thing. They are not: a special is a renter incentive and a commission is
 * agent compensation, and only one of them is ever shown to a client. Dark forest with bright
 * green text separates them at a glance, and the dollar sign gives the badge its own mark —
 * the special keeps its tag, the gift card its gift.
 *
 * Only the colours and the icon changed. Size, typography, padding, radius and placement are
 * the values each surface already used, which is why `size` exists rather than one shared pill.
 */

const SIZES = {
  /** Recommended Properties and Favorites rows. */
  row: "rounded-lg px-2.5 py-[3px] text-[11px]",
  /** The map card, which runs a half-point larger and uses a tighter radius. */
  card: "rounded-md px-2.5 py-[3px] text-[11.5px]",
} as const

/** Understated, and sized in em so it tracks the badge's own font size. */
function DollarMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none opacity-90"
      style={{ width: "0.95em", height: "0.95em" }}
    >
      <path d="M12 2v20" />
      <path d="M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.9 5 3.4 5 1.4 5 3.6-2.2 3.5-5 3.5-5-1.3-5-3.2" />
    </svg>
  )
}

export default function CommissionBadge({
  status,
  size = "row",
  className = "",
}: {
  /** Straight from evaluateLocatorCommission. Taken whole, rather than as loose state + text,
   *  because CommissionStatus is a DISCRIMINATED UNION: `text` exists only on the paying
   *  variant, and splitting it would throw that guarantee away at the call site. */
  status: CommissionStatus
  size?: keyof typeof SIZES
  className?: string
}): ReactNode {
  const s = SIZES[size]
  if (status.state === "paying") {
    return (
      <span
        className={`inline-flex items-center gap-1 whitespace-nowrap border font-medium leading-none ${s} border-[#1e5235] bg-[#0f2a1d] text-[#4ade80] ${className}`}
      >
        <DollarMark />
        <span className="font-semibold">Commission:</span> {status.text}
      </span>
    )
  }
  if (status.state === "not_paying") {
    return (
      <span className={`inline-block whitespace-nowrap border font-semibold leading-none ${s} border-[#eaa9a5] bg-[#fdeaea] text-[#b42318] ${className}`}>
        Not Paying Locators
      </span>
    )
  }
  return (
    <span className={`inline-block whitespace-nowrap border font-medium leading-none ${s} border-[#cbd4e0] bg-[#eef1f5] text-[#5a6b86] ${className}`}>
      Commission Not Verified
    </span>
  )
}
