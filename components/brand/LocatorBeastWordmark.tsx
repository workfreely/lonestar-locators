import Image from "next/image"

// The full black Locator Beast wordmark, for LIGHT surfaces.
//
// One component rather than a per-page <Image>, because the white wordmark
// taught us what page-by-page copies cost: the intrinsic width/height must
// track the file, and a stale pair silently reserves a wrong-ratio box and
// shifts layout. Callers pass only a height; width follows the real artwork.
//
// The asset is the approved source trimmed to its ink (2172x724 -> 1821x343).
// The original canvas was 52.6% transparent padding plus an invisible halo
// (13,654 px at max alpha 8/255), so any given CSS height rendered less than
// half the artwork. Trimming means the same box now shows 2.11x more logo with
// no oversized-CSS compensation. Every visible pixel is unchanged — the trim is
// a crop of the source buffer, not a re-render.
const INTRINSIC_W = 1821
const INTRINSIC_H = 343

export default function LocatorBeastWordmark({
  height,
  className = "",
  priority = false,
}: {
  /** Rendered height in px. Width is derived from the artwork's 5.309 ratio. */
  height: number
  className?: string
  priority?: boolean
}) {
  // `sizes` must describe the real DISPLAY width. Without it Next assumes the
  // declared intrinsic width and emits a single 3840w candidate — shipping the
  // full-resolution source for a ~200px logo.
  const displayWidth = Math.round((height * INTRINSIC_W) / INTRINSIC_H)
  return (
    <Image
      src="/locator-beast/locator-beast-black-logo-transparent.png"
      alt="Locator Beast"
      width={INTRINSIC_W}
      height={INTRINSIC_H}
      sizes={`${displayWidth}px`}
      priority={priority}
      className={className}
      style={{ height, width: "auto" }}
    />
  )
}
