// Social Autopilot — ONE overlay spec shared by the FFmpeg renderer and the editing preview,
// so the on-screen preview matches the burned-in output. Geometry is expressed against the
// 1080×1920 (9:16) Reel canvas as fractions, plus font sizes in canvas pixels. Safe area keeps
// text clear of the Reel UI (top actions, bottom caption/controls).

export const OVERLAY_CANVAS = { w: 1080, h: 1920 } as const

export const OVERLAY_SPEC = {
  // Vertical anchors as a fraction of canvas height.
  headline: { yFrac: 0.13, fontPx: 76, lineSpacing: 8, boxAlpha: 0.32, boxBorderPx: 24 },
  // The sub sits `gapPx` BELOW the bottom of the (possibly multi-line) headline block — never a
  // fixed offset from the headline top — so a wrapped headline always pushes the sub down.
  sub: { gapPx: 44, fontPx: 40, boxAlpha: 0.28, boxBorderPx: 16 },
  safe: { topFrac: 0.1, bottomFrac: 0.2, sideMarginPx: 64 },
  wrap: { headlineMaxChars: 18, maxLines: 3 }, // shared headline wrapping (preview === render)
} as const

/** Deterministic headline wrapping — SHARED by the CSS preview and the FFmpeg render so both
 *  produce the SAME line count (and therefore the same sub-headline position). Greedy word wrap
 *  at `maxChars`; a single over-long word keeps its own line. Capped at `maxLines`. */
export function wrapHeadline(text: string | null | undefined, maxChars = OVERLAY_SPEC.wrap.headlineMaxChars): string[] {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    if (!cur) cur = w
    else if ((cur + " " + w).length <= maxChars) cur += " " + w
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.slice(0, OVERLAY_SPEC.wrap.maxLines)
}

/** Height (canvas px) of a headline block of `lineCount` lines. */
export function headlineBlockPx(lineCount: number): number {
  const n = Math.max(1, lineCount)
  return n * OVERLAY_SPEC.headline.fontPx + (n - 1) * OVERLAY_SPEC.headline.lineSpacing
}

/** Editing-preview helper: convert canvas px / fracs to % of the preview box (which is also
 *  9:16), so the CSS approximation lines up with where FFmpeg will draw. The sub position is a
 *  function of the headline's line count so the two never collide. The FINAL preview still plays
 *  the real rendered file — this is only for the pre-render editing view. */
export function overlayPreviewStyle(headlineLineCount = 1) {
  const subTopPx = OVERLAY_SPEC.headline.yFrac * OVERLAY_CANVAS.h + headlineBlockPx(headlineLineCount) + OVERLAY_SPEC.sub.gapPx
  return {
    headlineTopPct: OVERLAY_SPEC.headline.yFrac * 100,
    headlineFontPct: (OVERLAY_SPEC.headline.fontPx / OVERLAY_CANVAS.h) * 100, // vh-relative
    subTopPct: (subTopPx / OVERLAY_CANVAS.h) * 100,
    subFontPct: (OVERLAY_SPEC.sub.fontPx / OVERLAY_CANVAS.h) * 100,
    sideMarginPct: (OVERLAY_SPEC.safe.sideMarginPx / OVERLAY_CANVAS.w) * 100,
  }
}
