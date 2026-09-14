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
  // Template 1 uses ONE FIXED headline size (81px) for EVERY supported {city} {type_plural} combo,
  // so all posts look visually consistent — no per-combo resizing. 81px is the largest single size
  // at which the WIDEST supported combo ("SAN ANTONIO RENTAL HOMES", 988px @94 in the production
  // font) still fits on one line inside the safe box, using a slightly wider-but-safe 90px margin
  // (8.3% each side; was an over-conservative 140px/13%). maxChars/maxLines are the FALLBACK wrap
  // for arbitrary/custom headline text only (never for the controlled Template-1 vocabulary).
  headline: { yFrac: 0.13, fontPx: 81, lineSpacing: 8, boxAlpha: 0.32, boxBorderPx: 24, maxChars: 16, maxLines: 3, sideMarginPx: 90 },
  // The sub sits `gapPx` BELOW the headline block. gap tightened 44→35 (~20%) so the headline +
  // "Starting at $…/mo" read as one compact lockup. Its safe box is ≈86% of the canvas (930px;
  // 75px margins each side). maxChars/maxLines/hard-split unchanged (shared preview===render).
  sub: { gapPx: 35, fontPx: 40, lineSpacing: 6, boxAlpha: 0.28, boxBorderPx: 16, maxChars: 33, maxLines: 4, sideMarginPx: 75 },
  safe: { topFrac: 0.1, bottomFrac: 0.2 },
} as const

// Readability for generated overlay text is LETTER-HUGGING only — a subtle dark OUTLINE plus a
// small soft drop shadow attached to the glyphs. NO background band/scrim/box: the footage around
// and between the letters is left untouched. Shared by the CSS preview and the FFmpeg render so the
// two match. Border widths are absolute canvas px (per element); the preview scales them via em so
// the proportion matches at any preview size.
export const OVERLAY_TEXT = {
  borderAlpha: 0.5,
  headlineBorderPx: 3,
  subBorderPx: 2,
  shadowAlpha: 0.6,
  shadowDx: 0,
  shadowDy: 2,
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

// ── Headline sizing (Template 1: ONE fixed size for every supported combo) ───────────────────
// The headline vocabulary is CONTROLLED ({city} {property_type_plural}). Widths were measured once
// with the production font (assets/social/fonts/Overlay-Bold.ttf) at 94px — real advance widths,
// NOT character counts — to pick the single fixed size (OVERLAY_SPEC.headline.fontPx = 81px) at
// which the WIDEST combo still fits one line inside the 90px-margin safe box. This table is the
// SUPPORTED SET (its 94px widths are kept for documentation/verification); every entry renders at
// the SAME fixed font. Any headline NOT in the set (arbitrary/custom text) falls back to char-wrap.
//
// Usable text width = canvas − 2·sideMargin − 2·boxBorder (the box must stay in the safe area).
export const HEADLINE_TEXT_AVAIL_PX =
  OVERLAY_CANVAS.w - 2 * OVERLAY_SPEC.headline.sideMarginPx - 2 * OVERLAY_SPEC.headline.boxBorderPx // 852 (90px margins)

// Measured advance width (px) of each uppercase headline at 94px in Overlay-Bold.ttf. Used to
// derive/verify the fixed size and as the supported-combo membership set (font is FIXED, not scaled).
const HEADLINE_WIDTH_AT_94: Record<string, number> = {
  "AUSTIN STUDIOS": 542, "AUSTIN APARTMENTS": 715, "AUSTIN HIGH-RISES": 642, "AUSTIN TOWNHOMES": 703, "AUSTIN RENTAL HOMES": 779, "AUSTIN PENTHOUSES": 691,
  "DALLAS STUDIOS": 558, "DALLAS APARTMENTS": 731, "DALLAS HIGH-RISES": 658, "DALLAS TOWNHOMES": 719, "DALLAS RENTAL HOMES": 795, "DALLAS PENTHOUSES": 707,
  "DFW STUDIOS": 454, "DFW APARTMENTS": 627, "DFW HIGH-RISES": 554, "DFW TOWNHOMES": 615, "DFW RENTAL HOMES": 691, "DFW PENTHOUSES": 603,
  "HOUSTON STUDIOS": 614, "HOUSTON APARTMENTS": 787, "HOUSTON HIGH-RISES": 714, "HOUSTON TOWNHOMES": 775, "HOUSTON RENTAL HOMES": 851, "HOUSTON PENTHOUSES": 763,
  "SAN ANTONIO STUDIOS": 751, "SAN ANTONIO APARTMENTS": 924, "SAN ANTONIO HIGH-RISES": 851, "SAN ANTONIO TOWNHOMES": 912, "SAN ANTONIO RENTAL HOMES": 988, "SAN ANTONIO PENTHOUSES": 900,
}

export type HeadlineFit = { fontPx: number; lines: string[] }

/** Template 1 headline sizing: ONE fixed font (OVERLAY_SPEC.headline.fontPx) for EVERY supported
 *  {city} {type_plural} combo, which all fit on one line at that size. Arbitrary/custom headlines
 *  keep the same fixed font but fall back to the multi-line char-wrap so they can't overflow.
 *  Shared by the FFmpeg render and the CSS preview (parity). Font size never varies by combination. */
export function headlineFit(text: string | null | undefined): HeadlineFit {
  const fontPx = OVERLAY_SPEC.headline.fontPx // FIXED for Template 1
  const t = (text ?? "").trim()
  if (!t) return { fontPx, lines: [] }
  if (HEADLINE_WIDTH_AT_94[t.toUpperCase()]) return { fontPx, lines: [t] } // supported combo → one line
  return { fontPx, lines: wrapHeadline(t) } // custom/unknown text → char-wrap fallback
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
