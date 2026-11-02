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
 * green text separates them at a glance — the special keeps its tag, the gift card its gift.
 *
 * THE DECORATIVE DOLLAR MARK WAS REMOVED (2026-11-02, by request): the chip is narrow and the
 * icon was spending width without adding information. It was `aria-hidden`, so assistive tech
 * never announced it and nothing accessible is lost; the aria-label and title below still carry
 * the word "Commission" for every reader. Only the colours changed here. Size, typography,
 * padding, radius and placement are the values each surface already used, which is why `size`
 * exists rather than one shared pill.
 */

const SIZES = {
  /** Recommended Properties and Favorites rows. */
  row: "rounded-lg px-2.5 py-[3px] text-[11px]",
  /** The map card, which runs a half-point larger and uses a tighter radius. */
  card: "rounded-md px-2.5 py-[3px] text-[11.5px]",
} as const

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
      // THE WORD IS GONE, THE MEANING IS NOT. "Commission:" was dropped to buy back width on a
      // chip that sits beside two others, and the decorative dollar mark that stood in for it has
      // now gone too — so the chip shows the VALUE alone ("Send 125% · Escort 125%"). The
      // accessible name and the hover title are what carry the category now, for every reader
      // rather than only the sighted ones. Keep them: without them this is a number with no
      // subject. inline-flex / gap-1 are left as they are — one child, so nothing shifts.
      <span
        aria-label={`Commission: ${status.text}`}
        title={`Commission: ${status.text}`}
        className={`inline-flex items-center gap-1 whitespace-nowrap border font-medium leading-none ${s} border-[#1e5235] bg-[#0f2a1d] text-[#4ade80] ${className}`}
      >
        <span className="font-semibold">{status.text}</span>
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
