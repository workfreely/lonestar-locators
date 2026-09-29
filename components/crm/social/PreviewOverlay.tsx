import type { CSSProperties } from "react"
import { OVERLAY_CANVAS, OVERLAY_TEXT, type OverlayBlock, type OverlayLayout } from "@/lib/social/overlaySpec"

// Typography depth: a localized black DROP SHADOW (small offset + tiny blur) that lifts the white
// letters off bright footage, plus a MINIMAL 8-direction EDGE — not a heavy outline, no band. The
// tiny blur is kept close to FFmpeg's hard-offset shadow (drawtext has no blur) so preview↔render
// read materially the same.
function depthShadow(): string {
  const e = OVERLAY_TEXT.edgeEm
  const dirs: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]
  const edge = dirs.map(([x, y]) => `${(x * e).toFixed(3)}em ${(y * e).toFixed(3)}em 0 rgba(0,0,0,${OVERLAY_TEXT.edgeAlpha})`).join(", ")
  const drop = `${OVERLAY_TEXT.shadowDxEm}em ${OVERLAY_TEXT.shadowDyEm}em ${OVERLAY_TEXT.shadowBlurEm}em rgba(0,0,0,${OVERLAY_TEXT.shadowAlpha})`
  return `${edge}, ${drop}`
}

// SHARED overlay composition (pre-render CSS approximation) used by BOTH the inline Post Editor
// preview and the enlarged 9:16 lightbox, so they can never drift. It renders whatever the chosen
// TEMPLATE's layout (computeOverlayLayout) produces — Hero, Center Hook, or Center Hook + Detail —
// at the same font/size/position/spacing the FFmpeg render uses. Font sizes are in `cqh`, so this
// element sets containerType:size and fills a 9:16 parent. Editing APPROXIMATION only.
// Bodoni Moda cuts (must match the FFmpeg render): headlines = display cut, detail = text cut.
const FONT_HEAD = '"OverlayHead", Georgia, "Times New Roman", serif'
const FONT_DETAIL = '"OverlayDetail", Georgia, "Times New Roman", serif'

function blockStyle(b: OverlayBlock, weight: number, fontFamily: string): CSSProperties {
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
    letterSpacing: `${OVERLAY_TEXT.trackingEm}em`,
    textShadow: depthShadow(),
    whiteSpace: "pre",
  }
}

// Weight + family come from the block's own `face`, so the preview loads exactly the file the FFmpeg
// render draws with. The conversational detail carries face "head" (Libre Baskerville Bold) while the
// HERO detail stays "detail" (Bodoni text cut) — one switch, both blocks, no per-template branching.
const faceOf = (b: OverlayBlock): [number, string] => (b.face === "head" ? [650, FONT_HEAD] : [500, FONT_DETAIL])

const blockText = (b: OverlayBlock) => (b.uppercase ? b.lines.join("\n").toUpperCase() : b.lines.join("\n"))

// COMPOUND two-line hero: the block carries a size AND a top per line, so each line is its own
// absolutely-positioned div at that exact top. Both keep the block's symmetric side margins and
// textAlign:center, so they centre on the SAME axis — the same axis FFmpeg's x=(w-text_w)/2 uses —
// with no padding applied to either. Returns null when the block has no per-line geometry.
function perLineBlocks(b: OverlayBlock): React.ReactElement[] | null {
  if (!b.linePx || !b.lineTopPx) return null
  const [weight, fontFamily] = faceOf(b)
  return b.lines.map((line, i) => (
    <div key={i} style={{
      ...blockStyle({ ...b, fontPx: b.linePx![i], topPx: b.lineTopPx![i] }, weight, fontFamily),
    }}>{b.uppercase ? line.toUpperCase() : line}</div>
  ))
}

export default function PreviewOverlay({ layout }: { layout: OverlayLayout | null }) {
  if (!layout) return null
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden style={{ containerType: "size" }}>
      {/* Each Bodoni cut is a single baked weight (headline w650, detail w500); the @font-face maps
          100–900 to it with no synthetic bolding. Headline uses the display cut, detail the text cut. */}
      {layout.headline.lines.length > 0 && (perLineBlocks(layout.headline)
        ?? <div style={blockStyle(layout.headline, ...faceOf(layout.headline))}>{blockText(layout.headline)}</div>)}
      {layout.detail && layout.detail.lines.length > 0 && <div style={blockStyle(layout.detail, ...faceOf(layout.detail))}>{blockText(layout.detail)}</div>}
    </div>
  )
}
