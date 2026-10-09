// AI PRESENTER — geometry and timing. ONE source of truth, consumed by both the FFmpeg renderer
// and the editor preview, exactly as overlaySpec is.
//
// The lesson that produced that rule is recorded in the overlay work: a second hand-rolled copy of
// the geometry silently defeated a correct fix for a whole release. So every number the presenter
// needs lives here, in canvas units, with a fractional twin for CSS. Nothing downstream computes
// its own placement.
//
// ── WHY LOWER-LEFT, AND WHY THESE NUMBERS ───────────────────────────────────────────────────
// The canvas is 1080×1920 and Instagram covers parts of it with its own UI. Both constraints come
// from platformSafeArea, which was MEASURED from a published Reel rather than taken from a style
// guide:
//
//   caption / profile block   starts at canvas y 1548   -> the presenter's feet must stay above it
//   engagement rail           x 978..1080               -> irrelevant on the left, but it is why
//                                                          the presenter is on the left at all
//   headline text box         x 110..970
//
// The presenter's left edge is 110 — the same left edge as the headline box — so the two read as
// one composition rather than two unrelated overlays. Its bottom sits 36px clear of the caption
// block. It is anchored BY ITS BOTTOM (`H-h-...`), not by its top, so a taller or shorter avatar
// clip keeps its feet on the same line instead of drifting into the caption.
//
// ── THE FROZEN HEADLINE IS NOT TOUCHED ──────────────────────────────────────────────────────
// y427 is the approved production baseline for the T1/T4/T16 anchor. The presenter occupies
// y1032..1512 at the default size — 605px BELOW the headline's baseline band and entirely clear of
// the centred lockups (T2 y890, T15 y941, T17 y914.5). The presenter is also composited BEFORE the
// drawtext chain, so text is always drawn on top of the avatar and can never be occluded by it.
import { SOCIAL_CANVAS, safeAreaFor } from "./platformSafeArea"

export const PRESENTER = {
  /** Left edge, canvas units. Matches the headline box's left edge. */
  xPx: 110,
  /** Rendered width. Height follows the clip's own aspect ratio (`-2` in the scale filter). */
  widthPx: 360,
  /** Gap between the presenter's bottom edge and the top of Instagram's caption block. */
  captionClearancePx: 36,
  /** Default spoken intro length. Clamped to [MIN, MAX] everywhere it is accepted. */
  defaultIntroSeconds: 4,
  minIntroSeconds: 3,
  maxIntroSeconds: 5,
  /** Fade-out duration. Applied to the ALPHA channel, so the avatar dissolves rather than
   *  darkening to a black rectangle. */
  fadeSeconds: 0.6,
} as const

/** Where the presenter's bottom edge sits, in canvas units from the top. */
export function presenterBottomPx(platform: string = "instagram"): number {
  const area = safeAreaFor(platform)
  const caption = area.zones.find((z) => z.kind === "caption")
  // No caption zone declared (a platform we have not measured) → fall back to a 20% bottom inset
  // rather than letting the avatar sit on the very bottom edge.
  const captionTop = caption ? caption.rect.y : Math.round(SOCIAL_CANVAS.h * 0.8)
  return captionTop - PRESENTER.captionClearancePx
}

/** Distance from the canvas BOTTOM to the presenter's bottom edge — what `overlay=y=H-h-N` needs. */
export function presenterBottomInsetPx(platform: string = "instagram"): number {
  return SOCIAL_CANVAS.h - presenterBottomPx(platform)
}

/** Clamp an operator-supplied intro length into the supported range. Non-finite → the default. */
export function clampIntroSeconds(seconds: number | null | undefined): number {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return PRESENTER.defaultIntroSeconds
  return Math.min(PRESENTER.maxIntroSeconds, Math.max(PRESENTER.minIntroSeconds, seconds))
}

/**
 * CSS-ready fractions for the editor preview. The preview positions a box with percentages; these
 * are the SAME numbers the renderer uses, divided by the canvas, so the two cannot drift.
 */
export function presenterPreviewFractions(platform: string = "instagram") {
  return {
    leftFrac: PRESENTER.xPx / SOCIAL_CANVAS.w,
    widthFrac: PRESENTER.widthPx / SOCIAL_CANVAS.w,
    bottomFrac: presenterBottomInsetPx(platform) / SOCIAL_CANVAS.h,
  }
}

/**
 * THE DECODER FLAG THAT MAKES TRANSPARENCY WORK.
 *
 * Measured on the renderer's own binary (ffmpeg-static 6.0): FFmpeg's NATIVE vp9/vp8 decoders
 * SILENTLY DISCARD the alpha channel. No warning, no error — the clip simply composites as an
 * opaque rectangle. The libvpx wrapper decoders read it correctly.
 *
 * This matters because WebM is the ONLY transparent format HeyGen emits (and the only one any
 * vendor in this market emits), so the default path is exactly the broken one.
 *
 * Returns null for formats whose alpha needs no special decoder (ProRes 4444, QTRLE, APNG), which
 * are what a locally-produced stand-in clip is likely to be.
 */
export function decoderForPresenterClip(filePath: string): string | null {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase()
  if (ext === ".webm") return "libvpx-vp9"
  return null
}

export type PresenterPlan = {
  /** ffmpeg input index this clip was appended at. */
  inputIndex: number
  introSeconds: number
  xPx: number
  widthPx: number
  bottomInsetPx: number
  fadeSeconds: number
}

export function buildPresenterPlan(input: {
  inputIndex: number
  introSeconds?: number | null
  platform?: string
}): PresenterPlan {
  return {
    inputIndex: input.inputIndex,
    introSeconds: clampIntroSeconds(input.introSeconds),
    xPx: PRESENTER.xPx,
    widthPx: PRESENTER.widthPx,
    bottomInsetPx: presenterBottomInsetPx(input.platform ?? "instagram"),
    fadeSeconds: PRESENTER.fadeSeconds,
  }
}

/**
 * The presenter's two filter nodes, composited onto `[bg]` and emitting `outLabel`.
 *
 *   scale      width-driven, `-2` keeps the clip's own aspect and an even height (x264 needs it)
 *   format     yuva420p — makes the alpha channel explicit before anything consumes it
 *   fade       alpha=1 is the whole point: without it the clip fades to BLACK, i.e. a dark
 *              rectangle grows where the avatar was. With it, the avatar dissolves.
 *   overlay    bottom-anchored; `enable` stops compositing once the fade has completed, and
 *              eof_action=pass keeps the walkthrough running after the short avatar clip ends —
 *              without it ffmpeg would end the whole video when the avatar does.
 */
export function buildPresenterFilter(plan: PresenterPlan, outLabel: string): string {
  const fadeStart = Math.max(0, plan.introSeconds - plan.fadeSeconds)
  const pres = `[${plan.inputIndex}:v]scale=${plan.widthPx}:-2,format=yuva420p,` +
    `fade=t=out:st=${fadeStart.toFixed(3)}:d=${plan.fadeSeconds.toFixed(3)}:alpha=1,` +
    `setpts=PTS-STARTPTS[pres]`
  const comp = `[bg][pres]overlay=x=${plan.xPx}:y=H-h-${plan.bottomInsetPx}:` +
    `enable='lt(t,${plan.introSeconds.toFixed(3)})':eof_action=pass:shortest=0[${outLabel}]`
  return `${pres};${comp}`
}
