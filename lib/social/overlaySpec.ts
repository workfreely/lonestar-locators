// Social Autopilot — ONE overlay spec shared by the FFmpeg renderer and the editing preview,
// so the on-screen preview matches the burned-in output. Geometry is expressed against the
// 1080×1920 (9:16) Reel canvas as fractions, plus font sizes in canvas pixels. Safe area keeps
// text clear of the Reel UI (top actions, bottom caption/controls).

export const OVERLAY_CANVAS = { w: 1080, h: 1920 } as const

export const OVERLAY_SPEC = {
  // Vertical anchors as a fraction of canvas height.
  headline: { yFrac: 0.13, fontPx: 76, lineSpacing: 8, boxAlpha: 0.32, boxBorderPx: 24 },
  sub: { gapPx: 120, fontPx: 40, boxAlpha: 0.28, boxBorderPx: 16 }, // sub sits gapPx below the headline anchor
  safe: { topFrac: 0.1, bottomFrac: 0.2, sideMarginPx: 64 },
} as const

/** Editing-preview helper: convert canvas px / fracs to % of the preview box (which is also
 *  9:16), so the CSS approximation lines up with where FFmpeg will draw. The FINAL preview
 *  still plays the real rendered file — this is only for the pre-render editing view. */
export function overlayPreviewStyle() {
  return {
    headlineTopPct: OVERLAY_SPEC.headline.yFrac * 100,
    headlineFontPct: (OVERLAY_SPEC.headline.fontPx / OVERLAY_CANVAS.h) * 100, // vh-relative
    subTopPct: ((OVERLAY_SPEC.headline.yFrac * OVERLAY_CANVAS.h + OVERLAY_SPEC.sub.gapPx) / OVERLAY_CANVAS.h) * 100,
    subFontPct: (OVERLAY_SPEC.sub.fontPx / OVERLAY_CANVAS.h) * 100,
    sideMarginPct: (OVERLAY_SPEC.safe.sideMarginPx / OVERLAY_CANVAS.w) * 100,
  }
}
