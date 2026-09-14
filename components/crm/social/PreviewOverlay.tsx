import type { CSSProperties } from "react"
import { OVERLAY_SPEC, OVERLAY_TEXT } from "@/lib/social/overlaySpec"

// Letter-hugging readability shadow, matching the FFmpeg render: a dark OUTLINE (8-direction, sized
// by em so it scales with the font) plus a small soft drop shadow — NO background band. `fontPx` is
// the element's canvas font size, so the border-in-em matches the render's absolute border width.
function hugShadow(borderPx: number, fontPx: number): string {
  const e = borderPx / fontPx // outline thickness as a fraction of the font (em)
  const a = OVERLAY_TEXT.borderAlpha
  const dirs: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]
  const outline = dirs.map(([x, y]) => `${(x * e).toFixed(3)}em ${(y * e).toFixed(3)}em 0 rgba(0,0,0,${a})`).join(", ")
  const drop = `${OVERLAY_TEXT.shadowDx / fontPx}em ${(OVERLAY_TEXT.shadowDy / fontPx).toFixed(3)}em ${(1.5 * e).toFixed(3)}em rgba(0,0,0,${OVERLAY_TEXT.shadowAlpha})`
  return `${outline}, ${drop}`
}

// SHARED overlay composition (pre-render CSS approximation) used by BOTH the inline Post Editor
// preview and the enlarged 9:16 lightbox, so the two can never drift. It renders the headline +
// subheadline with the SAME font, size, position, spacing, alignment, and visibility rules driven
// by overlayPreviewStyle(). Font sizes are in `cqh`, so this element sets containerType:size and
// fills its parent (absolute inset-0) — the parent MUST be position:relative and a 9:16 box, so
// the same fractions render proportionally identical in the small preview and the large modal.
// This is the editing APPROXIMATION only (not the burned-in FFmpeg render).

export type OverlayPreviewGeometry = {
  headlineTopPct: number
  headlineFontPct: number
  sideMarginPct: number
  subTopPct: number
  subFontPct: number
  subLineHeight: number
  subSideMarginPct: number
}

export default function PreviewOverlay({
  headLines,
  subLines,
  ov,
  showHeadline,
  showSub,
}: {
  headLines: string[]
  subLines: string[]
  ov: OverlayPreviewGeometry
  showHeadline: boolean
  showSub: boolean
}) {
  if (!showHeadline && !showSub) return null
  // Use the SAME production font as the FFmpeg render so glyph widths match, and `pre` so the
  // browser NEVER re-wraps the already-computed lines (headlineFit/wrapSub decide the line breaks —
  // the preview must not recompute wrapping with a different font's metrics). This is what made
  // "SAN ANTONIO TOWNHOMES" wrap to two lines: the default system font is wider than Overlay-Bold
  // and `pre-line` let it break at the space.
  const FONT = '"OverlayBold", system-ui, sans-serif'
  const headStyle: CSSProperties = {
    position: "absolute",
    top: `${ov.headlineTopPct}%`,
    left: `${ov.sideMarginPct}%`,
    right: `${ov.sideMarginPct}%`,
    textAlign: "center",
    color: "white",
    fontFamily: FONT,
    fontWeight: 800,
    lineHeight: 1.05,
    fontSize: `${ov.headlineFontPct}cqh`,
    textShadow: hugShadow(OVERLAY_TEXT.headlineBorderPx, OVERLAY_SPEC.headline.fontPx),
    whiteSpace: "pre",
  }
  const subStyle: CSSProperties = {
    position: "absolute",
    top: `${ov.subTopPct}%`,
    left: `${ov.subSideMarginPct}%`,
    right: `${ov.subSideMarginPct}%`,
    textAlign: "center",
    color: "white",
    fontFamily: FONT,
    fontWeight: 700,
    lineHeight: ov.subLineHeight,
    fontSize: `${ov.subFontPct}cqh`,
    textShadow: hugShadow(OVERLAY_TEXT.subBorderPx, OVERLAY_SPEC.sub.fontPx),
    whiteSpace: "pre",
  }

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden style={{ containerType: "size" }}>
      {showHeadline && <div style={headStyle}>{headLines.join("\n").toUpperCase()}</div>}
      {showSub && <div style={subStyle}>{subLines.join("\n")}</div>}
    </div>
  )
}
