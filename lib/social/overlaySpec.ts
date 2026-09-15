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
  // no per-post resizing. Bodoni Moda is much WIDER than the old condensed Anton, so the fixed size
  // is 56px: at 56px the WIDEST supported combo ("SAN ANTONIO RENTAL HOMES", 1440px @94 in Bodoni-
  // Head) fits ONE line inside the 900px safe box (90px margins) in BOTH paths — render ≈858px, and
  // CSS preview ≈885px WITH OVERLAY_TEXT.trackingEm (0.02) applied. maxChars/maxLines are the FALLBACK
  // wrap for arbitrary/custom headline text only (never for the controlled Template-1 vocabulary).
  headline: { yFrac: 0.13, fontPx: 56, lineSpacing: 8, boxAlpha: 0.32, boxBorderPx: 24, maxChars: 16, maxLines: 3, sideMarginPx: 90 },
  // The sub/detail sits `gapPx` BELOW the headline block; it is the SECONDARY line and reads smaller
  // and lighter than the headline (Bodoni-Detail, opsz 18). 36px keeps the headline clearly dominant.
  // Its safe box is ≈86% of the canvas (930px; 75px margins each side). maxChars/maxLines unchanged.
  sub: { gapPx: 35, fontPx: 36, lineSpacing: 6, boxAlpha: 0.28, boxBorderPx: 16, maxChars: 33, maxLines: 4, sideMarginPx: 75 },
  safe: { topFrac: 0.1, bottomFrac: 0.2 },
} as const

// NOTE ON THE FONT: the active overlay face is BODONI MODA (open-source, OFL, from Google Fonts),
// instanced to two static cuts we bundle: headlines use the DISPLAY cut (opsz 96, wght 600 —
// high-contrast, dramatic thick/thin) and detail text uses the TEXT cut (opsz 18, wght 500 — more
// legible small). Bodoni is a high-contrast Didone: elegant/editorial, NOT condensed or heavy. Anton
// (the old Overlay-Bold.ttf) is no longer used by the overlay system.
//
// Typography depth: white text + subtle CHARACTER TRACKING + a NOTICEABLE-but-refined DROP SHADOW
// that carries most of the separation (so Bodoni's thin strokes pop on bright walls/windows/skies),
// plus only a MINIMAL 1px hairline edge — NO background band/scrim/box, and NOT a heavy outline.
// Values are in em (fraction of the element's own font size), so preview and render scale identically.
// FFmpeg drawtext has NO letter-spacing and NO shadow blur (verified), so the burned-in render uses a
// hard-offset shadow and omits tracking; the CSS preview keeps a small blur so the two read materially
// the same (a soft-shadow difference is expected). A truly soft/glowy shadow would need PNG text
// rasterization — deferred.
export const OVERLAY_TEXT = {
  trackingEm: 0.02, // subtle inter-character tracking (reduced 0.03→0.02 so the widest Hero combo fits one line in Bodoni)
  edgeAlpha: 0.28, // MINIMAL 1px hairline edge — the shadow does the heavy lifting, not this
  edgeEm: 0.008, //   ~1px at every size (never a thick outline)
  shadowAlpha: 0.75, // NOTICEABLE black drop shadow — lifts the thin Bodoni strokes off bright footage
  shadowDxEm: 0,
  shadowDyEm: 0.06, // visible depth straight below the text (premium, not a hard duplicate)
  shadowBlurEm: 0.08, // CSS-only blur (FFmpeg render is a hard offset) — soft, premium, not a glow
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
// with the active headline font (assets/social/fonts/BodoniModa-Head.ttf) at 94px — real advance
// widths, NOT character counts — to pick the single fixed size (OVERLAY_SPEC.headline.fontPx = 56px)
// at which the WIDEST combo still fits one line inside the 90px-margin safe box. This table is the
// SUPPORTED SET (its 94px widths are kept for documentation/verification); every entry renders at
// the SAME fixed font. Any headline NOT in the set (arbitrary/custom text) falls back to char-wrap.
//
// Usable text width = canvas − 2·sideMargin (no background box any more, so no box padding).
export const HEADLINE_TEXT_AVAIL_PX = OVERLAY_CANVAS.w - 2 * OVERLAY_SPEC.headline.sideMarginPx // 900 (90px margins)

// Measured advance width (px) of each uppercase headline at 94px in BodoniModa-Head.ttf. Used to
// derive/verify the fixed size and as the supported-combo membership set (font is FIXED, not scaled).
const HEADLINE_WIDTH_AT_94: Record<string, number> = {
  "AUSTIN STUDIOS": 802, "AUSTIN APARTMENTS": 1047, "AUSTIN HIGH-RISES": 943, "AUSTIN TOWNHOMES": 1022, "AUSTIN RENTAL HOMES": 1131, "AUSTIN PENTHOUSES": 1013,
  "DALLAS STUDIOS": 819, "DALLAS APARTMENTS": 1064, "DALLAS HIGH-RISES": 960, "DALLAS TOWNHOMES": 1039, "DALLAS RENTAL HOMES": 1148, "DALLAS PENTHOUSES": 1030,
  "DFW STUDIOS": 661, "DFW APARTMENTS": 906, "DFW HIGH-RISES": 802, "DFW TOWNHOMES": 881, "DFW RENTAL HOMES": 990, "DFW PENTHOUSES": 872,
  "HOUSTON STUDIOS": 905, "HOUSTON APARTMENTS": 1150, "HOUSTON HIGH-RISES": 1046, "HOUSTON TOWNHOMES": 1125, "HOUSTON RENTAL HOMES": 1234, "HOUSTON PENTHOUSES": 1116,
  "SAN ANTONIO STUDIOS": 1111, "SAN ANTONIO APARTMENTS": 1356, "SAN ANTONIO HIGH-RISES": 1252, "SAN ANTONIO TOWNHOMES": 1331, "SAN ANTONIO RENTAL HOMES": 1440, "SAN ANTONIO PENTHOUSES": 1322,
  "AUSTIN LOFTS": 685, "DALLAS LOFTS": 702, "DFW LOFTS": 544, "HOUSTON LOFTS": 788, "SAN ANTONIO LOFTS": 994,
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
// ONE fixed size for the center-hook hook, chosen so the LONGEST supported sentence ("Your sign to
// get that rental home in San Antonio") still fits ONE line inside the 900px safe box in BOTH paths
// with Bodoni-Head — at 37px: render ≈839px, CSS preview ≈875px WITH tracking — so hooks never wrap
// or stack. When a center-hook template carries a detail line (T5 Upgrade), the detail uses
// `detailFontPx` (smaller than the hook, Bodoni-Detail) so the headline stays clearly dominant.
// Shared by preview + render (parity).
export const CENTER_HOOK = { fontPx: 37, lineSpacing: 8, detailFontPx: 30 } as const

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
