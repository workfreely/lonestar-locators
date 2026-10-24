"use client"

import { resolvePromoBadges, truncateBadgeLabel, type PromoBadgeInput } from "@bc/companion-shared"

/**
 * PROMOTIONAL BADGES — the move-in special and the resident gift card, on one row.
 *
 * WHAT TO SHOW is decided by resolvePromoBadges in companion-shared; this file decides only how
 * it looks. Every CRM surface renders through here, so the pills cannot drift apart between the
 * Map, Recommended Properties and Favorites. (The client-facing /r page has its own stylesheet
 * and renders the same resolver's output with its own classes.)
 *
 * ── ONE ROW, NEVER TWO ──────────────────────────────────────────────────────────────────────
 * flex-nowrap, by requirement: a second line of badges adds height to every card on the screen
 * and reads as clutter. The row fits instead of wrapping —
 *
 *   • the badges sit in a container the caller bounds (left/right inset over the image), so they
 *     can never extend past the photo or reach the favorite button in the opposite corner;
 *   • each pill is min-w-0 with a truncating label, so the long one gives up characters rather
 *     than pushing the short one out of the frame;
 *   • the icon is flex-none — an icon that shrinks turns into a smear.
 *
 * Truncation only ever SHORTENS. It keeps the leading qualifier ("Up to …") and drops the tail,
 * so a hedged claim can never be truncated into an unconditional one.
 *
 * ── COLOUR CARRIES MEANING ──────────────────────────────────────────────────────────────────
 * Green = rent concession, blue = gift card. The blue is the pill colour specials have always
 * used on these cards, kept for the gift card so the existing visual language still means
 * "there is an offer here"; the concession moves to green to separate the two at a glance.
 */

const SIZES = {
  /** Over a property photo — Map card and the client-style image overlay. */
  card: {
    row: "gap-1.5",
    pill: "gap-1 rounded-lg px-2.5 py-[3px] text-[11.5px] shadow-sm",
    icon: "text-[12px]",
  },
  /** Inline in a dense list row — Recommended Properties, Favorites. */
  compact: {
    row: "gap-1",
    pill: "gap-[3px] rounded-md px-1.5 py-[1px] text-[9px]",
    icon: "text-[10px]",
  },
} as const

const TONES = {
  special: "border-[#8fcaa6] bg-[#e4f4ea] text-[#16633a]",
  gift_card: "border-[#8fb6ea] bg-[#e8f0fe] text-[#1c3f75]",
} as const

/** Inline SVG rather than an icon dependency: these render inside a Google Maps InfoWindow and
 *  on a server-rendered client page, neither of which loads the CRM's icon font. */
function BadgeIcon({ kind, className }: { kind: "special" | "gift_card"; className: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true }
  return kind === "special" ? (
    // tag
    <svg {...common} className={`${className} flex-none`} style={{ width: "1em", height: "1em" }}>
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
      <circle cx="7" cy="7" r="1.5" />
    </svg>
  ) : (
    // gift
    <svg {...common} className={`${className} flex-none`} style={{ width: "1em", height: "1em" }}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
      <path d="M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  )
}

export default function PromoBadges({
  size = "card",
  className = "",
  maxChars,
  ...input
}: PromoBadgeInput & {
  size?: keyof typeof SIZES
  className?: string
  /** Label cap. Narrower surfaces pass a smaller number; it can only shorten. */
  maxChars?: number
}) {
  const badges = resolvePromoBadges(input)
  if (badges.length === 0) return null
  const s = SIZES[size]
  // The CHARACTER cap is a backstop for an absurd string, not the fitting mechanism. Fitting is
  // done by CSS: each pill is min-w-0 with a truncating label inside a flex-nowrap row, so the
  // browser shrinks them to whatever width the container actually has — which adapts to the
  // real screen instead of guessing at one. A tight character cap would truncate on a wide card
  // where the full label fits comfortably.
  const cap = maxChars ?? 28

  return (
    <div className={`flex flex-nowrap items-center ${s.row} ${className}`}>
      {badges.map((b) => (
        <span
          key={b.kind}
          // min-w-0 is what lets the label truncate instead of forcing the row wider.
          // shrink (the flex default) + min-w-0 is what lets a long label give up characters
          // instead of pushing its neighbour out of the frame. basis-auto keeps a short pill at
          // its natural width so only the long one pays.
          className={`inline-flex min-w-0 shrink items-center border font-semibold leading-none ${s.pill} ${TONES[b.kind]}`}
          title={b.text}
        >
          <BadgeIcon kind={b.kind} className={s.icon} />
          <span className="truncate">{truncateBadgeLabel(b.text, cap)}</span>
        </span>
      ))}
    </div>
  )
}
