// Social Autopilot — ONE overlay spec shared by the FFmpeg renderer and the editing preview,
// so the on-screen preview matches the burned-in output. Geometry is expressed against the
// 1080×1920 (9:16) Reel canvas as fractions, plus font sizes in canvas pixels. Safe area keeps
// text clear of the Reel UI (top actions, bottom caption/controls).

export const OVERLAY_CANVAS = { w: 1080, h: 1920 } as const

// Reels-safe overlay geometry. Each text element has a CENTERED max-width box (never
// edge-to-edge): the box width = canvas − 2·sideMarginPx, and text is greedily wrapped to
// `maxChars` (chosen so a full line ≈ the box width at that font) with an even harder per-word
// character break so nonsense/no-space text can never run off-screen. The SAME wrap drives both
// the CSS preview and the FFmpeg render (FFmpeg centers each line via x=(w-text_w)/2, so the
// char-wrap is what constrains its width to the box). Headline box ≈ 800px, sub box ≈ 930px.
export const OVERLAY_SPEC = {
  // `fontPx` (94) is now the MAXIMUM headline size. Template 1 headlines ({city} {type_plural})
  // are FIT-TO-WIDTH per combination via headlineFit(): a headline that fits at 94px keeps 94px;
  // longer ones shrink only as much as needed to stay ONE line inside the safe box (down to
  // minFontPx). maxChars/maxLines are the FALLBACK wrap for arbitrary/custom headline text only.
  headline: { yFrac: 0.13, fontPx: 94, minFontPx: 60, lineSpacing: 8, boxAlpha: 0.32, boxBorderPx: 24, maxChars: 14, maxLines: 3, sideMarginPx: 140 },
  // The sub sits `gapPx` BELOW the headline block. gap tightened 44→35 (~20%) so the headline +
  // "Starting at $…/mo" read as one compact lockup. Its safe box is ≈86% of the canvas (930px;
  // 75px margins each side). maxChars/maxLines/hard-split unchanged (shared preview===render).
  sub: { gapPx: 35, fontPx: 40, lineSpacing: 6, boxAlpha: 0.28, boxBorderPx: 16, maxChars: 33, maxLines: 4, sideMarginPx: 75 },
  safe: { topFrac: 0.1, bottomFrac: 0.2 },
} as const

// Deterministic word-wrap — SHARED by the CSS preview and the FFmpeg render so both produce the
// SAME lines. Greedy by words; a single word longer than `maxChars` is HARD-split into
// maxChars-sized chunks so even no-space text stays inside the box. Capped at `maxLines`.
function wrapWords(text: string | null | undefined, maxChars: number, maxLines: number): string[] {
  const raw = (text ?? "").trim().split(/\s+/).filter(Boolean)
  // Pre-split any over-long word into hard chunks (no whitespace to break on otherwise).
  const words: string[] = []
  for (const w of raw) {
    if (w.length <= maxChars) words.push(w)
    else for (let i = 0; i < w.length; i += maxChars) words.push(w.slice(i, i + maxChars))
  }
  if (words.length === 0) return []
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    if (!cur) cur = w
    else if ((cur + " " + w).length <= maxChars) cur += " " + w
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.slice(0, maxLines)
}

/** Headline wrapping — drives the sub position via line count (preview === render). */
export function wrapHeadline(text: string | null | undefined, maxChars = OVERLAY_SPEC.headline.maxChars): string[] {
  return wrapWords(text, maxChars, OVERLAY_SPEC.headline.maxLines)
}

/** Subheadline wrapping — keeps a long sub inside its centered safe-area box as a compact
 *  multi-line block (preview === render), instead of stretching across the video. */
export function wrapSub(text: string | null | undefined, maxChars = OVERLAY_SPEC.sub.maxChars): string[] {
  return wrapWords(text, maxChars, OVERLAY_SPEC.sub.maxLines)
}

// ── Headline fit-to-width (Template 1) ───────────────────────────────────────────────────────
// The headline vocabulary is CONTROLLED ({city} {property_type_plural}), so widths are measured
// once with the actual production font (assets/social/fonts/Overlay-Bold.ttf) via PIL getlength
// at the 94px base and baked here — real rendered advance widths, NOT character counts. At render
// AND preview time we scale the font linearly to keep the drawn text inside the safe box on ONE
// line. Any headline NOT in this table (arbitrary/custom text) falls back to the char-wrap.
//
// Usable text width = canvas − 2·sideMargin − 2·boxBorder (the black box must stay in the safe
// area). fontPx = clamp( floor(94 · usable / width@94), minFontPx, 94 ).
export const HEADLINE_TEXT_AVAIL_PX =
  OVERLAY_CANVAS.w - 2 * OVERLAY_SPEC.headline.sideMarginPx - 2 * OVERLAY_SPEC.headline.boxBorderPx // 752

// Measured advance width (px) of each uppercase headline at 94px in Overlay-Bold.ttf.
const HEADLINE_WIDTH_AT_94: Record<string, number> = {
  "AUSTIN STUDIOS": 542, "AUSTIN APARTMENTS": 715, "AUSTIN HIGH-RISES": 642, "AUSTIN TOWNHOMES": 703, "AUSTIN RENTAL HOMES": 779, "AUSTIN PENTHOUSES": 691,
  "DALLAS STUDIOS": 558, "DALLAS APARTMENTS": 731, "DALLAS HIGH-RISES": 658, "DALLAS TOWNHOMES": 719, "DALLAS RENTAL HOMES": 795, "DALLAS PENTHOUSES": 707,
  "DFW STUDIOS": 454, "DFW APARTMENTS": 627, "DFW HIGH-RISES": 554, "DFW TOWNHOMES": 615, "DFW RENTAL HOMES": 691, "DFW PENTHOUSES": 603,
  "HOUSTON STUDIOS": 614, "HOUSTON APARTMENTS": 787, "HOUSTON HIGH-RISES": 714, "HOUSTON TOWNHOMES": 775, "HOUSTON RENTAL HOMES": 851, "HOUSTON PENTHOUSES": 763,
  "SAN ANTONIO STUDIOS": 751, "SAN ANTONIO APARTMENTS": 924, "SAN ANTONIO HIGH-RISES": 851, "SAN ANTONIO TOWNHOMES": 912, "SAN ANTONIO RENTAL HOMES": 988, "SAN ANTONIO PENTHOUSES": 900,
}

export type HeadlineFit = { fontPx: number; lines: string[] }

/** Fit a headline to ONE line at the largest size that keeps its box inside the safe area. For a
 *  known controlled combination this uses the measured width; for anything else it falls back to
 *  the char-wrap at the base font (so custom text still can't overflow). Shared by preview+render. */
export function headlineFit(text: string | null | undefined): HeadlineFit {
  const t = (text ?? "").trim()
  if (!t) return { fontPx: OVERLAY_SPEC.headline.fontPx, lines: [] }
  const w94 = HEADLINE_WIDTH_AT_94[t.toUpperCase()]
  if (w94 && w94 > 0) {
    const raw = Math.floor((OVERLAY_SPEC.headline.fontPx * HEADLINE_TEXT_AVAIL_PX) / w94)
    const fontPx = Math.max(OVERLAY_SPEC.headline.minFontPx, Math.min(OVERLAY_SPEC.headline.fontPx, raw))
    return { fontPx, lines: [t] } // one line, uppercase preserved as supplied
  }
  // Unknown/custom headline → base font + the existing multi-line char-wrap safety.
  return { fontPx: OVERLAY_SPEC.headline.fontPx, lines: wrapHeadline(t) }
}

/** Height (canvas px) of a headline block of `lineCount` lines at `fontPx` (defaults to the max). */
export function headlineBlockPx(lineCount: number, fontPx: number = OVERLAY_SPEC.headline.fontPx): number {
  const n = Math.max(1, lineCount)
  return n * fontPx + (n - 1) * OVERLAY_SPEC.headline.lineSpacing
}

/** Editing-preview helper: convert canvas px / fracs to % of the preview box (which is also
 *  9:16), so the CSS approximation lines up with where FFmpeg will draw. The sub position is a
 *  function of the headline's line count so the two never collide. The FINAL preview still plays
 *  the real rendered file — this is only for the pre-render editing view. */
export function overlayPreviewStyle(headlineLineCount = 1, headlineFontPx: number = OVERLAY_SPEC.headline.fontPx) {
  const subTopPx = OVERLAY_SPEC.headline.yFrac * OVERLAY_CANVAS.h + headlineBlockPx(headlineLineCount, headlineFontPx) + OVERLAY_SPEC.sub.gapPx
  return {
    headlineTopPct: OVERLAY_SPEC.headline.yFrac * 100,
    headlineFontPct: (headlineFontPx / OVERLAY_CANVAS.h) * 100, // cqh (of preview box) — fit-to-width size
    subTopPct: (subTopPx / OVERLAY_CANVAS.h) * 100,
    subFontPct: (OVERLAY_SPEC.sub.fontPx / OVERLAY_CANVAS.h) * 100,
    subLineHeight: (OVERLAY_SPEC.sub.fontPx + OVERLAY_SPEC.sub.lineSpacing) / OVERLAY_SPEC.sub.fontPx, // unitless
    sideMarginPct: (OVERLAY_SPEC.headline.sideMarginPx / OVERLAY_CANVAS.w) * 100, // headline box (~800px)
    subSideMarginPct: (OVERLAY_SPEC.sub.sideMarginPx / OVERLAY_CANVAS.w) * 100, // narrower sub box (~720px)
  }
}
