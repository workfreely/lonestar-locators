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
  // Template 1 (Hero) uses ONE FIXED headline size for EVERY supported {city} {type_plural} combo —
  // no per-post resizing. Refined 78→70px (~10% smaller) for a less dominant, more editorial feel;
  // at 70px the WIDEST supported combo ("SAN ANTONIO RENTAL HOMES", 988px @94 in the bundled font)
  // fits ONE line inside the 900px safe box (90px margins, no box) WITH OVERLAY_TEXT.trackingEm
  // applied — tracked width ≈ 786px, ~57px spare each side. maxChars/maxLines are the FALLBACK wrap
  // for arbitrary/custom headline text only (never for the controlled Template-1 vocabulary).
  headline: { yFrac: 0.13, fontPx: 70, lineSpacing: 8, boxAlpha: 0.32, boxBorderPx: 24, maxChars: 16, maxLines: 3, sideMarginPx: 90 },
  // The sub/detail sits `gapPx` BELOW the headline block; it is the SECONDARY line and reads smaller
  // and lighter than the headline. 40→36px keeps the headline clearly dominant. Its safe box is ≈86%
  // of the canvas (930px; 75px margins each side). maxChars/maxLines/hard-split unchanged (parity).
  sub: { gapPx: 35, fontPx: 36, lineSpacing: 6, boxAlpha: 0.28, boxBorderPx: 16, maxChars: 33, maxLines: 4, sideMarginPx: 75 },
  safe: { topFrac: 0.1, bottomFrac: 0.2 },
} as const

// NOTE ON THE FONT: the bundled overlay face (assets/social/fonts/Overlay-Bold.ttf) is actually
// ANTON — a single-weight (400), ultra-condensed heavy POSTER typeface. It has no lighter weight,
// so CSS font-weight cannot lighten it and there is no "medium/semibold Anton" to switch to. The
// bulk of the "chunky/stamped" look is the typeface itself; the levers we DO control (and that
// stay in preview↔render parity) are the letter EDGE, the drop SHADOW, and the SIZE — refined below.
// A true editorial/"Atelier" look would require an approved editorial font asset (not present).
//
// Typography depth: subtle CHARACTER TRACKING + a localized DROP SHADOW that carries the depth, with
// only a MINIMAL letter edge for reliability on bright footage — NO background band/scrim/box, and
// NOT a meme-style outline. Values are in em (fraction of the element's own font size), so preview
// and render scale identically. FFmpeg drawtext has NO letter-spacing and NO shadow blur (verified),
// so the burned-in render uses a hard-offset shadow and omits tracking; the CSS preview keeps only a
// tiny blur so the two read materially the same. A truly soft/glowy shadow would require switching
// the render to rasterized text (PNG) — deferred pending approval.
export const OVERLAY_TEXT = {
  trackingEm: 0.03, // subtle inter-character tracking (Option A) — between letters, not words
  edgeAlpha: 0.25, // subtle 1px hairline edge (was 0.28) — needed for reliability on near-white footage
  edgeEm: 0.008, //   (was 0.02) — the chunk came from EDGE WIDTH (2px→1px on Hero), not this alpha
  shadowAlpha: 0.6, // localized black drop shadow (was 0.7) — lifts letters off bright footage
  shadowDxEm: 0,
  shadowDyEm: 0.045, // (was 0.05) — a touch tighter under the text
  shadowBlurEm: 0.045, // CSS-only blur (was 0.07) — kept small so it approximates FFmpeg's hard offset
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
// with the bundled font (assets/social/fonts/Overlay-Bold.ttf = Anton) at 94px — real advance widths,
// NOT character counts — to pick the single fixed size (OVERLAY_SPEC.headline.fontPx = 70px) at
// which the WIDEST combo still fits one line inside the 90px-margin safe box. This table is the
// SUPPORTED SET (its 94px widths are kept for documentation/verification); every entry renders at
// the SAME fixed font. Any headline NOT in the set (arbitrary/custom text) falls back to char-wrap.
//
// Usable text width = canvas − 2·sideMargin (no background box any more, so no box padding).
export const HEADLINE_TEXT_AVAIL_PX = OVERLAY_CANVAS.w - 2 * OVERLAY_SPEC.headline.sideMarginPx // 900 (90px margins)

// Measured advance width (px) of each uppercase headline at 94px in Overlay-Bold.ttf. Used to
// derive/verify the fixed size and as the supported-combo membership set (font is FIXED, not scaled).
const HEADLINE_WIDTH_AT_94: Record<string, number> = {
  "AUSTIN STUDIOS": 542, "AUSTIN APARTMENTS": 715, "AUSTIN HIGH-RISES": 642, "AUSTIN TOWNHOMES": 703, "AUSTIN RENTAL HOMES": 779, "AUSTIN PENTHOUSES": 691,
  "DALLAS STUDIOS": 558, "DALLAS APARTMENTS": 731, "DALLAS HIGH-RISES": 658, "DALLAS TOWNHOMES": 719, "DALLAS RENTAL HOMES": 795, "DALLAS PENTHOUSES": 707,
  "DFW STUDIOS": 454, "DFW APARTMENTS": 627, "DFW HIGH-RISES": 554, "DFW TOWNHOMES": 615, "DFW RENTAL HOMES": 691, "DFW PENTHOUSES": 603,
  "HOUSTON STUDIOS": 614, "HOUSTON APARTMENTS": 787, "HOUSTON HIGH-RISES": 714, "HOUSTON TOWNHOMES": 775, "HOUSTON RENTAL HOMES": 851, "HOUSTON PENTHOUSES": 763,
  "SAN ANTONIO STUDIOS": 751, "SAN ANTONIO APARTMENTS": 924, "SAN ANTONIO HIGH-RISES": 851, "SAN ANTONIO TOWNHOMES": 912, "SAN ANTONIO RENTAL HOMES": 988, "SAN ANTONIO PENTHOUSES": 900,
  "AUSTIN LOFTS": 462, "DALLAS LOFTS": 478, "DFW LOFTS": 374, "HOUSTON LOFTS": 534, "SAN ANTONIO LOFTS": 671,
}

/** Tracked advance width (canvas px) of a supported headline at the fixed size WITH tracking:
 *  base-advance scaled from the 94px measurement + trackingEm applied between every character.
 *  Used to verify one-line fit inside HEADLINE_TEXT_AVAIL_PX. */
export function trackedHeadlineWidthPx(text: string, fontPx = OVERLAY_SPEC.headline.fontPx, trackingEm = OVERLAY_TEXT.trackingEm): number {
  const base = HEADLINE_WIDTH_AT_94[text.toUpperCase()]
  if (base == null) return NaN
  return (base * fontPx) / 94 + trackingEm * fontPx * text.length
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

// ── Overlay TEMPLATE layout families ─────────────────────────────────────────────────────────
// HERO (T1/T3): uppercase {city}{type} headline near the top + optional detail below (Template-1
// geometry). CENTER HOOK (T2/T4): a sentence-case hook, wrapped, VERTICALLY CENTERED, no detail —
// NOT forced into the giant Hero size. CENTER HOOK + DETAIL (T5): centered hook + a detail line
// below, the whole group centered. Center-hook typography is a FIRST PASS (size/wrap tunable).
export type LayoutFamily = "hero" | "center_hook" | "center_hook_detail"
// ONE fixed, smaller size for the center-hook hook, chosen so the LONGEST supported sentence
// ("Your sign to get that rental home in San Antonio", with tracking) still fits ONE line inside the
// 900px safe box — so hooks never wrap or stack. Refined 42→38px (~10% smaller) alongside the Hero
// reduction for a lighter, more editorial feel (the fit only improves at the smaller size). When a
// center-hook template carries a detail line (T5 Upgrade), the detail uses `detailFontPx` (smaller
// than the hook) so the headline stays clearly dominant. Shared by preview + render (parity).
export const CENTER_HOOK = { fontPx: 38, lineSpacing: 8, detailFontPx: 30 } as const

export function templateFamily(template: string): LayoutFamily {
  if (template === "your_sign" || template === "next_property") return "center_hook"
  if (template === "upgrade") return "center_hook_detail"
  return "hero" // market_type, special_feature, unknown → hero
}

export type OverlayBlock = { lines: string[]; fontPx: number; topPx: number; uppercase: boolean; sideMarginPx: number; lineSpacing: number }
export type OverlayLayout = { family: LayoutFamily; headline: OverlayBlock; detail: OverlayBlock | null }

/** Resolve the on-canvas (1080×1920) layout for a template + its already-computed headline/detail
 *  text. Shared by the CSS preview and the FFmpeg render so the two match. */
export function computeOverlayLayout(template: string, headlineText: string, detailText: string): OverlayLayout {
  const family = templateFamily(template)
  const H = OVERLAY_CANVAS.h
  const detail = (detailText ?? "").trim()

  if (family === "hero") {
    const fit = headlineFit(headlineText)
    const headTop = OVERLAY_SPEC.headline.yFrac * H
    const headline: OverlayBlock = { lines: fit.lines, fontPx: fit.fontPx, topPx: headTop, uppercase: true, sideMarginPx: OVERLAY_SPEC.headline.sideMarginPx, lineSpacing: OVERLAY_SPEC.headline.lineSpacing }
    let detailBlock: OverlayBlock | null = null
    if (detail) {
      const detailTop = headTop + headlineBlockPx(Math.max(1, fit.lines.length), fit.fontPx) + OVERLAY_SPEC.sub.gapPx
      detailBlock = { lines: wrapSub(detail), fontPx: OVERLAY_SPEC.sub.fontPx, topPx: detailTop, uppercase: false, sideMarginPx: OVERLAY_SPEC.sub.sideMarginPx, lineSpacing: OVERLAY_SPEC.sub.lineSpacing }
    }
    return { family, headline, detail: detailBlock }
  }

  // Center hook (+ optional detail) — the hook is ONE line at the fixed smaller size (no wrapping,
  // no manual breaks). Vertically center the group.
  const oneLine = (headlineText ?? "").replace(/\s+/g, " ").trim()
  const lines = oneLine ? [oneLine] : []
  const n = Math.max(1, lines.length)
  const headBlockH = n * CENTER_HOOK.fontPx + (n - 1) * CENTER_HOOK.lineSpacing
  const hasDetail = family === "center_hook_detail" && detail.length > 0
  const detailLines = hasDetail ? wrapSub(detail) : []
  // Center-hook detail is smaller than the hook (CENTER_HOOK.detailFontPx) so the hook stays dominant.
  const detailBlockH = hasDetail ? detailLines.length * CENTER_HOOK.detailFontPx + Math.max(0, detailLines.length - 1) * OVERLAY_SPEC.sub.lineSpacing : 0
  const gap = hasDetail ? OVERLAY_SPEC.sub.gapPx : 0
  const totalH = headBlockH + gap + detailBlockH
  const groupTop = (H - totalH) / 2
  const headline: OverlayBlock = { lines, fontPx: CENTER_HOOK.fontPx, topPx: groupTop, uppercase: false, sideMarginPx: OVERLAY_SPEC.headline.sideMarginPx, lineSpacing: CENTER_HOOK.lineSpacing }
  const detailBlock: OverlayBlock | null = hasDetail
    ? { lines: detailLines, fontPx: CENTER_HOOK.detailFontPx, topPx: groupTop + headBlockH + gap, uppercase: false, sideMarginPx: OVERLAY_SPEC.sub.sideMarginPx, lineSpacing: OVERLAY_SPEC.sub.lineSpacing }
    : null
  return { family, headline, detail: detailBlock }
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
