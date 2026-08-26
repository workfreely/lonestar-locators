import Image from "next/image"

// The full Locator Beast wordmark. ONE component for both colours, because the
// two used to be sized and positioned by different mechanisms — the white one
// through a Tailwind `h-7` class with a hand-picked `sizes="176px"`, the black
// one through an inline height with a derived `sizes` — and values maintained in
// two places drift. Now a caller picks a height and a variant; everything else
// (aspect, width, srcset hint) is derived identically for both.
//
// Each asset is the approved source trimmed to its own ink, so the intrinsic
// pairs differ slightly and MUST track their files: a stale pair reserves a
// wrong-ratio box and shifts layout.
//
//   white 1794x329 (ratio 5.4529) — trimmed from a 2141x734 canvas
//   black 1821x343 (ratio 5.3090) — trimmed from a 2172x724 canvas
//
// The ratios differ because the artwork differs, so at a shared height the two
// render slightly different WIDTHS. That is inherent to the logos, not a sizing
// inconsistency: height and left edge are what align a header lockup, and those
// are identical.
const ASSETS = {
  white: { src: "/locator-beast/locator-beast-white-logo-transparent.png", w: 1794, h: 329 },
  black: { src: "/locator-beast/locator-beast-black-logo-transparent.png", w: 1821, h: 343 },
} as const

/** Height of the wordmark in any AppHeader — dark or light. The single source
 *  for the approved 28px, so the two headers cannot drift apart. */
export const HEADER_LOGO_HEIGHT = 28

/** The approved 8px nudge off the header's px-5 edge, giving both headers the
 *  same 28px effective x-position. A class, not a number, so it stays a single
 *  token shared by every AppHeader surface. */
export const HEADER_LOGO_OFFSET = "ml-2"

/** The marketing nav's height. Deliberately NOT the header token: that shell is
 *  h-16/h-20, not the AppHeader's h-14, so 28px read far too small in it. This
 *  is the approved 40px already used on /login, /signup, and billing. */
export const NAV_LOGO_HEIGHT = 40

export default function LocatorBeastWordmark({
  variant = "black",
  height,
  className = "",
  priority = false,
}: {
  /** Which artwork. The ONLY thing that differs between headers. */
  variant?: keyof typeof ASSETS
  /** Rendered height in px. Width follows the variant's own ratio. */
  height: number
  className?: string
  priority?: boolean
}) {
  const asset = ASSETS[variant]
  // `sizes` must describe the real DISPLAY width. Without it Next assumes the
  // declared intrinsic width and emits a single 3840w candidate, shipping the
  // full-resolution source for a ~150px logo. Derived per variant so neither
  // colour can end up with a hand-tuned number the other lacks.
  const displayWidth = Math.round((height * asset.w) / asset.h)
  return (
    <Image
      src={asset.src}
      alt="Locator Beast"
      width={asset.w}
      height={asset.h}
      sizes={`${displayWidth}px`}
      priority={priority}
      className={className}
      style={{ height, width: "auto" }}
    />
  )
}
