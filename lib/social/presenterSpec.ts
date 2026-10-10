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

export type PresenterSide = "left" | "right"

export const PRESENTER = {
  /** Left edge, canvas units. Matches the headline box's left edge. */
  xPx: 110,
  /**
   * Rendered width. Height follows the clip's own aspect ratio (`-2` in the scale filter).
   *
   * 400, raised from 360 after reviewing a real HeyGen presenter against a mocked Reels interface:
   * at 360 the figure read as an inset rather than a presenter. 400 is prominent without competing
   * with the headline, which sits 320px above and is untouched by this.
   */
  widthPx: 400,
  /** Operator-adjustable width bounds, mirrored by a CHECK constraint on social_posts. */
  minWidthPx: 240,
  maxWidthPx: 520,
  /** Gap kept between a RIGHT-placed presenter and Instagram's engagement rail. */
  railClearancePx: 24,
  /** The approved default corner. */
  defaultSide: "left" as PresenterSide,
  /**
   * How far the presenter's feet sit BELOW the top of Instagram's caption block.
   *
   * Negative = above it (a clearance). Positive = deliberately overlapping into it.
   *
   * This was -36 (i.e. 36px of clearance, feet at y1512) and read as floating: 408px of the frame
   * sat empty beneath the figure, and a presenter that does not reach the bottom of the shot does
   * not look like it is standing in the room.
   *
   * THE MEASURED CONSTRAINT. The caption block begins at canvas y1548 — that is where Instagram
   * draws the username row, with the caption at y1649 and "View insights" at y1856, all
   * left-aligned and therefore directly over a left-placed presenter. There are only 36px between
   * the old position and that boundary, so a genuinely lower placement HAS to enter the zone;
   * there is no third option.
   *
   * +60 puts the feet at y1608: past the username row, stopping short of the caption text at
   * y1649. The overlap is the figure's lowest band — the bottom of the torso — which is the part
   * of a waist-up shot that carries the least information, and Instagram's username line is a
   * single row of text rather than a solid panel. The bottom gap falls from 408px to 312px.
   */
  captionOverlapPx: 60,
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
  // Never past the canvas itself, however the overlap is tuned.
  return Math.min(SOCIAL_CANVAS.h, captionTop + PRESENTER.captionOverlapPx)
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

/** Clamp an operator-supplied width into the supported range. Non-finite → the default. */
export function clampWidthPx(px: number | null | undefined): number {
  if (typeof px !== "number" || !Number.isFinite(px)) return PRESENTER.widthPx
  return Math.round(Math.min(PRESENTER.maxWidthPx, Math.max(PRESENTER.minWidthPx, px)))
}

export function normalizeSide(side: string | null | undefined): PresenterSide {
  return side === "right" ? "right" : PRESENTER.defaultSide
}

/**
 * Left edge for a given side and width.
 *
 * LEFT mirrors the headline box's own left margin. RIGHT is measured BACK from Instagram's
 * engagement rail rather than from the canvas edge — the rail is where the like/comment/share
 * icons sit, and a presenter tucked under them is both hidden and in the way. A width that would
 * not fit is pushed left until it does, which is why this returns a computed x rather than
 * rejecting the combination: the operator's size choice is honoured and the placement yields.
 */
export function presenterXPx(side: PresenterSide, widthPx: number, platform: string = "instagram"): number {
  if (side === "left") return PRESENTER.xPx
  const area = safeAreaFor(platform)
  const rail = area.zones.find((z) => z.kind === "rail")
  const railLeft = rail ? rail.rect.x : SOCIAL_CANVAS.w
  return Math.max(PRESENTER.xPx, railLeft - PRESENTER.railClearancePx - widthPx)
}

/**
 * CSS-ready fractions for the editor preview. The preview positions a box with percentages; these
 * are the SAME numbers the renderer uses, divided by the canvas, so the two cannot drift.
 */
export function presenterPreviewFractions(
  opts: { side?: string | null; widthPx?: number | null; platform?: string } = {},
) {
  const platform = opts.platform ?? "instagram"
  const side = normalizeSide(opts.side)
  const widthPx = clampWidthPx(opts.widthPx)
  return {
    leftFrac: presenterXPx(side, widthPx, platform) / SOCIAL_CANVAS.w,
    widthFrac: widthPx / SOCIAL_CANVAS.w,
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
  side: PresenterSide
  xPx: number
  widthPx: number
  bottomInsetPx: number
  fadeSeconds: number
}

export function buildPresenterPlan(input: {
  inputIndex: number
  introSeconds?: number | null
  /** Operator overrides. Both omitted ⇒ the approved default: lower-LEFT at the default width. */
  side?: string | null
  widthPx?: number | null
  platform?: string
  /** CALIBRATION ONLY. Overrides the computed bottom inset so placement candidates can be
   *  compared through the REAL renderer instead of a hand-rolled ffmpeg command. Nothing in the
   *  editor or database sets this — a second overlay path is how a correct fix once got silently
   *  defeated for a whole release, so candidates go through this one path too. */
  bottomInsetPxOverride?: number | null
}): PresenterPlan {
  const platform = input.platform ?? "instagram"
  const side = normalizeSide(input.side)
  const widthPx = clampWidthPx(input.widthPx)
  return {
    inputIndex: input.inputIndex,
    introSeconds: clampIntroSeconds(input.introSeconds),
    side,
    xPx: presenterXPx(side, widthPx, platform),
    widthPx,
    bottomInsetPx: typeof input.bottomInsetPxOverride === "number" ? input.bottomInsetPxOverride : presenterBottomInsetPx(platform),
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
