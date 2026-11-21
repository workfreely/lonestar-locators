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
  return {
    position: "absolute",
    top: `${(b.topPx / H) * 100}%`,
    // ── CENTRED ON THE CANVAS, NOT INSIDE THE MARGIN BOX ──────────────────────────────────────
    // The rule both surfaces are meant to share is platformSafeArea's: "Both renderers centre text
    // on the CANVAS, not inside the box" — FFmpeg draws every line at x=(w-text_w)/2.
    //
    // This used to be expressed as left: sideMargin / right: sideMargin + textAlign:center, which
    // centres on the canvas ONLY WHILE THE LINE FITS THE BOX. text-align can only distribute space
    // that exists: once a line is wider than its box there is none, the line starts at the box's
    // left content edge and the whole overflow goes to the RIGHT, so the ink centre moves right by
    // half the overflow. Nothing warns — it degrades silently, and only for long copy.
    //
    // It bit T1 + AI Presenter. The presenter narrows the detail box to 764px; "Exact unit shown:
    // $1,200/month" measures 894px against "Starting at $1,200/month" at 688px, so the same
    // template with the same price drew one mode centred and the other 65px right of centre, out
    // of agreement with its own headline AND with the burned-in render.
    //
    // Centring the shrink-wrapped line on the canvas axis states the rule directly, so it holds at
    // any length instead of only short ones. For every line that already fit, this is arithmetically
    // the same position it had — a symmetric box centred at 540 and the canvas centred at 540 are
    // the same axis — so nothing that fits moves by a pixel.
    //
    // The margins keep their real job, which was never positioning: they are the FIT/wrap budget
    // (headlineFit, DETAIL_TEXT_AVAIL_PX) and the safe-area contract. b.sideMarginPx is therefore
    // still carried on the block and still asserted by the layout suites; it is simply no longer
    // asked to do an alignment job it cannot do.
    left: "50%",
    transform: "translateX(-50%)",
    width: "max-content",
    maxWidth: "none",
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
// absolutely-positioned div at that exact top. Both go through blockStyle, so both are centred on
// the canvas axis — the same axis FFmpeg's x=(w-text_w)/2 uses — with no padding applied to
// either, and they stay on it even when one line is wider than the safe box (which is where the
// old symmetric-margin centring quietly stopped holding). Null when there is no per-line geometry.
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
