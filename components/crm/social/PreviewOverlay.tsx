import type { CSSProperties } from "react"
import { OVERLAY_CANVAS, overlayTextFor, type OverlayBlock, type OverlayLayout, type OverlayTextStyle } from "@/lib/social/overlaySpec"

// Typography depth: a localized black DROP SHADOW (small offset + tiny blur) that lifts the white
// letters off bright footage, plus a MINIMAL 8-direction EDGE — not a heavy outline, no band. The
// tiny blur is kept close to FFmpeg's hard-offset shadow (drawtext has no blur) so preview↔render
// read materially the same.
function depthShadow(t: OverlayTextStyle): string {
  const e = t.edgeEm
  const dirs: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]
  const edge = dirs.map(([x, y]) => `${(x * e).toFixed(3)}em ${(y * e).toFixed(3)}em 0 rgba(0,0,0,${t.edgeAlpha})`).join(", ")
  const drop = `${t.shadowDxEm}em ${t.shadowDyEm}em ${t.shadowBlurEm}em rgba(0,0,0,${t.shadowAlpha})`
  return `${edge}, ${drop}`
}

// SHARED overlay composition (pre-render CSS approximation) used by BOTH the inline Post Editor
// preview and the enlarged 9:16 lightbox, so they can never drift. It renders whatever the chosen
// TEMPLATE's layout (computeOverlayLayout) produces — Hero, Center Hook, or Center Hook + Detail —
// at the same font/size/position/spacing the FFmpeg render uses. Font sizes are in `cqh`, so this
// element sets containerType:size and fills a 9:16 parent. Editing APPROXIMATION only.
// Overlay face (must match the FFmpeg render): Libre Baskerville Bold 700 for BOTH headline and
// detail alike. The second face this component used to carry has been removed from the system.
const FONT_HEAD = '"OverlayHead", Georgia, "Times New Roman", serif'

function blockStyle(b: OverlayBlock, weight: number, fontFamily: string, t: OverlayTextStyle): CSSProperties {
  const H = OVERLAY_CANVAS.h
  const W = OVERLAY_CANVAS.w
  return {
    position: "absolute",
    top: `${(b.topPx / H) * 100}%`,
    left: `${(b.sideMarginPx / W) * 100}%`,
    right: `${(b.sideMarginPx / W) * 100}%`,
    textAlign: "center",
    color: "white",
    fontFamily,
    fontWeight: weight,
    lineHeight: 1.12,
    fontSize: `${(b.fontPx / H) * 100}cqh`,
    letterSpacing: `${t.trackingEm}em`,
    textShadow: depthShadow(t),
    whiteSpace: "pre",
  }
}

// ONE face. Weight and family no longer depend on the block: OverlayFace has a single member, so
// a per-block lookup would be a branch that can only go one way. Kept as a function purely so the
// call sites read unchanged.
const faceOf = (_b: OverlayBlock): [number, string] => [700, FONT_HEAD]

const blockText = (b: OverlayBlock) => (b.uppercase ? b.lines.join("\n").toUpperCase() : b.lines.join("\n"))

// COMPOUND two-line hero: the block carries a size AND a top per line, so each line is its own
// absolutely-positioned div at that exact top. Both keep the block's symmetric side margins and
// textAlign:center, so they centre on the SAME axis — the same axis FFmpeg's x=(w-text_w)/2 uses —
// with no padding applied to either. Returns null when the block has no per-line geometry.
function perLineBlocks(b: OverlayBlock, t: OverlayTextStyle): React.ReactElement[] | null {
  if (!b.linePx || !b.lineTopPx) return null
  const [weight, fontFamily] = faceOf(b)
  return b.lines.map((line, i) => (
    <div key={i} style={{
      ...blockStyle({ ...b, fontPx: b.linePx![i], topPx: b.lineTopPx![i] }, weight, fontFamily, t),
    }}>{b.uppercase ? line.toUpperCase() : line}</div>
  ))
}

export default function PreviewOverlay({ layout }: { layout: OverlayLayout | null }) {
  if (!layout) return null
  // Resolved ONCE, from the layout's own template, and passed to the headline AND the detail. A
  // per-block lookup is what would let the two lines drift apart again.
  const text = overlayTextFor(layout.template)
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden style={{ containerType: "size" }}>
      {/* Libre Baskerville Bold is a single baked weight (700); the @font-face maps 100–900 onto it
          with no synthetic bolding, so the preview cannot be heavier than the render. Headline AND
          detail both use it. There is no outline — the face carries its own weight. */}
      {layout.headline.lines.length > 0 && (perLineBlocks(layout.headline, text)
        ?? <div style={blockStyle(layout.headline, ...faceOf(layout.headline), text)}>{blockText(layout.headline)}</div>)}
      {layout.detail && layout.detail.lines.length > 0 && <div style={blockStyle(layout.detail, ...faceOf(layout.detail), text)}>{blockText(layout.detail)}</div>}
    </div>
  )
}
