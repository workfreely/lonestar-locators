import type { CSSProperties } from "react"
import { OVERLAY_CANVAS, OVERLAY_SCRIM, overlayScrimBand } from "@/lib/social/overlaySpec"

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
  const letterSpacing = `${(OVERLAY_SCRIM.letterSpacingPx / OVERLAY_CANVAS.h) * 100}cqh`
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
    letterSpacing,
    textShadow: "0 2px 8px rgba(0,0,0,.6)",
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
    letterSpacing,
    textShadow: "0 2px 8px rgba(0,0,0,.6)",
    whiteSpace: "pre",
  }

  // Readability BACKDROP — a soft translucent dark band behind the text GROUP (not full-screen),
  // matching the FFmpeg scrim: a vertical fade that is transparent at the band's edges and peaks
  // (OVERLAY_SCRIM.peakAlpha) in the middle. Recover the headline px size from ov.headlineFontPct
  // so the band lands exactly where the render draws it.
  const headlineFontPx = (ov.headlineFontPct / 100) * OVERLAY_CANVAS.h
  const band = overlayScrimBand(showHeadline ? headLines.length : 0, showSub ? subLines.length : 0, headlineFontPx)
  const scrimStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    top: `${(band.topPx / OVERLAY_CANVAS.h) * 100}%`,
    height: `${(band.heightPx / OVERLAY_CANVAS.h) * 100}%`,
    background: `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,${OVERLAY_SCRIM.peakAlpha}) 50%, rgba(0,0,0,0) 100%)`,
  }

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden style={{ containerType: "size" }}>
      {(showHeadline || showSub) && band.heightPx > 0 && <div style={scrimStyle} />}
      {showHeadline && <div style={headStyle}>{headLines.join("\n").toUpperCase()}</div>}
      {showSub && <div style={subStyle}>{subLines.join("\n")}</div>}
    </div>
  )
}
