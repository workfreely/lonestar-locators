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
  // Template 1/3 (Hero) headline size is FIT-TO-WIDTH per actual text (see headlineFit): each combo
  // renders at the largest size in [HERO_MIN_PX, HERO_MAX_PX] that fits one line in the 900px safe box,
  // so "SAN ANTONIO TOWNHOMES" is larger than "SAN ANTONIO RENTAL HOMES". `fontPx` here is the START/
  // MAX (HERO_MAX_PX) used as the block default; the actual per-headline size comes from headlineFit.
  // maxChars/maxLines are the FALLBACK char-wrap for arbitrary/custom headline text only.
  headline: { yFrac: 0.13, fontPx: 66, lineSpacing: 8, boxAlpha: 0.32, boxBorderPx: 24, maxChars: 16, maxLines: 3, sideMarginPx: 90 },
  // The sub/detail sits `gapPx` BELOW the headline block; it is the SECONDARY line (Bodoni-Detail,
  // opsz 18). 44px (raised from 36) makes "Starting at $X/mo" clearly readable and intentional in the
  // editor/enlarged preview and the render, while staying clearly secondary to the headline (56–66).
  // Its safe box is ≈86% of the canvas (930px; 75px margins each side). maxChars/maxLines unchanged.
  sub: { gapPx: 35, fontPx: 44, lineSpacing: 6, boxAlpha: 0.28, boxBorderPx: 16, maxChars: 33, maxLines: 4, sideMarginPx: 75 },
  safe: { topFrac: 0.1, bottomFrac: 0.2 },
} as const

// NOTE ON THE FONT: the active overlay face is BODONI MODA (open-source, OFL, from Google Fonts),
// instanced to two static cuts we bundle: headlines use the DISPLAY cut (opsz 96, wght 650 — solid,
// high-contrast, dramatic thick/thin) and detail text uses the TEXT cut (opsz 18, wght 500 — more
// legible small). Bodoni is a high-contrast Didone: elegant/editorial, NOT condensed or heavy. Anton
// (the old Overlay-Bold.ttf) is no longer used by the overlay system.
//
// Typography treatment (tuned to a luxury-editorial reference): CRISP SOLID WHITE text with NO
// visible outline and NO obvious shadow — clean, not stamped. There is NO background band/scrim/box/
// gradient. We keep a SUBTLE, NON-OBVIOUS drop shadow only as insurance so the white text never
// disappears over pure-white walls / bright skies (imperceptible over normal mid-tone footage, like
// the reference). Values are in em (preview and render scale identically). FFmpeg drawtext has NO
// letter-spacing and NO shadow blur (verified), so the render uses a hard-offset shadow and omits
// tracking; the CSS preview adds a tiny blur so the two read materially the same.
export const OVERLAY_TEXT = {
  trackingEm: 0.02, // subtle inter-character tracking (keeps the widest Hero combo one line in Bodoni)
  edgeAlpha: 0, //     NO visible outline (crisp solid white per the reference)
  edgeEm: 0, //        (border width irrelevant at alpha 0)
  shadowAlpha: 0.6, // SUBTLE, non-obvious drop shadow (nudged 0.5→0.6) — helps white text separate
  shadowDxEm: 0, //    from bright skies / white walls without becoming an obvious design element
  shadowDyEm: 0.035, // small offset straight below the text (not an obvious drop shadow)
  shadowBlurEm: 0.05, // CSS-only blur (FFmpeg render is a hard offset) — keeps it soft, not a glow
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

// ── Headline sizing: deterministic FIT-TO-WIDTH (shared by preview + render) ──────────────────
// Rather than lock every headline to the worst-case size, each ACTUAL generated headline starts
// large and shrinks (by 1px) only until it fits one line inside the safe box. The width is computed
// from a baked per-character ADVANCE map (advance px at 100px in BodoniModa-Head, wght 500) — summing
// advances exactly equals FFmpeg drawtext's line width (drawtext applies no kerning), and adding the
// same trackingEm the CSS preview uses makes the fit conservative for the browser too. So the SAME
// pure function resolves the SAME px for a given (text) in both paths — no preview/render bait-and-
// switch. The result is larger, lighter, editorial headlines that only shrink when the words require.
//
// Usable text width = canvas − 2·sideMargin (no background box, so no box padding).
export const HEADLINE_TEXT_AVAIL_PX = OVERLAY_CANVAS.w - 2 * OVERLAY_SPEC.headline.sideMarginPx // 900 (90px margins)

// Hero (T1/T3) fit range and Center-hook (T2/T4/T5) fit range, in canvas px.
export const HERO_MAX_PX = 66, HERO_MIN_PX = 56
export const HOOK_MAX_PX = 46, HOOK_MIN_PX = 37

// Per-character advance (px) at 100px in BodoniModa-Head.ttf (wght 650). Covers the full headline
// vocabulary (A–Z, a–z, space, hyphen, colon, apostrophe). Any other char falls back to a mid
// advance (safe: slight over-estimate → shrinks a hair more, never clips).
const HEAD_ADV: Record<string, number> = {
  A: 77, B: 68, C: 69, D: 75, E: 62, F: 59, G: 75, H: 78, I: 41, J: 51, K: 75, L: 60, M: 87, N: 74, O: 75, P: 66, Q: 75, R: 73, S: 59, T: 67, U: 72, V: 77, W: 107, X: 78, Y: 73, Z: 60,
  a: 57, b: 62, c: 52, d: 62, e: 53, f: 40, g: 62, h: 61, i: 31, j: 32, k: 63, l: 34, m: 87, n: 61, o: 56, p: 62, q: 62, r: 47, s: 45, t: 36, u: 61, v: 57, w: 82, x: 57, y: 59, z: 48,
  " ": 25, "-": 36, ":": 25, "'": 25,
}
const ADV_FALLBACK = 55

/** Width (canvas px) of a headline at `fontPx` WITH tracking — the deterministic value both the
 *  FFmpeg render and the CSS preview are constrained by. */
export function headlineTextWidthPx(text: string, fontPx: number, trackingEm = OVERLAY_TEXT.trackingEm): number {
  let adv = 0
  for (const c of text) adv += HEAD_ADV[c] ?? ADV_FALLBACK
  return (adv * fontPx) / 100 + trackingEm * fontPx * text.length
}
/** Largest integer px in [minPx, maxPx] at which `text` fits one line inside the safe box. */
export function fitHeadlinePx(text: string, maxPx: number, minPx: number, availPx = HEADLINE_TEXT_AVAIL_PX): number {
  for (let px = maxPx; px > minPx; px--) if (headlineTextWidthPx(text, px) <= availPx) return px
  return minPx
}

// ── Detail (Bodoni-Detail) fit-to-width — for the price-bearing center-hook detail (T5/T8) ─────────
// Detail text uses the TEXT cut, which has different metrics from the headline, so it needs its own
// per-character advance map (advance px at 100px in BodoniModa-Detail, incl. digits/$,·/). Summed
// advances equal FFmpeg drawtext's line width; adding the same tracking the CSS preview uses keeps
// the fit conservative for the browser too — so preview and render resolve the SAME detail size.
export const DETAIL_TEXT_AVAIL_PX = OVERLAY_CANVAS.w - 2 * OVERLAY_SPEC.sub.sideMarginPx // 930 (75px margins)
const DETAIL_ADV: Record<string, number> = {
  A: 77, B: 66, C: 70, D: 73, E: 61, F: 59, G: 74, H: 77, I: 39, J: 47, K: 72, L: 60, M: 87, N: 76, O: 75, P: 64, Q: 75, R: 72, S: 58, T: 67, U: 72, V: 77, W: 102, X: 77, Y: 73, Z: 58,
  a: 54, b: 61, c: 51, d: 61, e: 53, f: 40, g: 60, h: 60, i: 30, j: 31, k: 61, l: 33, m: 86, n: 60, o: 56, p: 61, q: 61, r: 45, s: 44, t: 35, u: 60, v: 55, w: 78, x: 57, y: 56, z: 47,
  "0": 63, "1": 45, "2": 56, "3": 53, "4": 61, "5": 51, "6": 57, "7": 51, "8": 56, "9": 57,
  " ": 25, ".": 22, ",": 23, $: 57, "/": 41, "·": 21, ":": 25, "'": 25, "-": 36,
}
/** Width (canvas px) of a detail line at `fontPx` WITH tracking — constrains both render and preview. */
export function detailTextWidthPx(text: string, fontPx: number, trackingEm = OVERLAY_TEXT.trackingEm): number {
  let adv = 0
  for (const c of text) adv += DETAIL_ADV[c] ?? ADV_FALLBACK
  return (adv * fontPx) / 100 + trackingEm * fontPx * text.length
}
/** Largest integer px in [minPx, maxPx] at which the detail fits ONE line inside the detail safe box. */
export function fitDetailPx(text: string, maxPx: number, minPx: number, availPx = DETAIL_TEXT_AVAIL_PX): number {
  for (let px = maxPx; px > minPx; px--) if (detailTextWidthPx(text, px) <= availPx) return px
  return minPx
}
// Price-bearing center-hook detail (T5 Upgrade, T8 POV + Price): larger, fit-to-width, but COUPLED to
// stay a couple px below the hook so it always reads as clearly secondary (the hook is also the
// heavier wght-650 cut). Non-price center-hook detail keeps the small default.
const CENTER_HOOK_DETAIL_MIN = 30
// Detail max per template — reduced so the detail clearly supports (not competes with) the hook:
// T5 Upgrade 38, T8 POV+Price 40 (price stays strong but secondary). Still coupled ≤ hook − 2.
const CENTER_HOOK_DETAIL_TARGET: Record<string, number> = { upgrade: 38, pov_price: 40 }
function centerHookDetailMaxPx(template: string, hookPx: number): number {
  const target = CENTER_HOOK_DETAIL_TARGET[template] ?? CENTER_HOOK.detailFontPx
  return Math.min(target, Math.max(CENTER_HOOK_DETAIL_MIN, hookPx - 2)) // never larger than hook − 2
}
// Gap below the hook for center-hook + detail (T5/T8): tighter than the Hero sub gap so the two lines
// read as ONE lockup instead of two separated elements.
const CENTER_HOOK_DETAIL_GAP_PX = 16
// Hero (T3 Special + Feature) gap: tighter than the shared sub gap so its detail hugs the headline.
// T1 (market_type) keeps the standard OVERLAY_SPEC.sub.gapPx — do not change T1.
const SPECIAL_FEATURE_GAP_PX = 18

// Supported Hero vocabulary ({CITY} {TYPE_PLURAL}, uppercase) → renders one line (fit-to-width);
// any headline NOT in this set (arbitrary/custom) falls back to the multi-line char-wrap.
const SUPPORTED_HEADLINES: ReadonlySet<string> = new Set([
  "AUSTIN STUDIOS", "AUSTIN APARTMENTS", "AUSTIN HIGH-RISES", "AUSTIN TOWNHOMES", "AUSTIN RENTAL HOMES", "AUSTIN PENTHOUSES", "AUSTIN LOFTS",
  "DALLAS STUDIOS", "DALLAS APARTMENTS", "DALLAS HIGH-RISES", "DALLAS TOWNHOMES", "DALLAS RENTAL HOMES", "DALLAS PENTHOUSES", "DALLAS LOFTS",
  "DFW STUDIOS", "DFW APARTMENTS", "DFW HIGH-RISES", "DFW TOWNHOMES", "DFW RENTAL HOMES", "DFW PENTHOUSES", "DFW LOFTS",
  "HOUSTON STUDIOS", "HOUSTON APARTMENTS", "HOUSTON HIGH-RISES", "HOUSTON TOWNHOMES", "HOUSTON RENTAL HOMES", "HOUSTON PENTHOUSES", "HOUSTON LOFTS",
  "SAN ANTONIO STUDIOS", "SAN ANTONIO APARTMENTS", "SAN ANTONIO HIGH-RISES", "SAN ANTONIO TOWNHOMES", "SAN ANTONIO RENTAL HOMES", "SAN ANTONIO PENTHOUSES", "SAN ANTONIO LOFTS",
])

/** Back-compat helper (used in tests): width of a supported headline at a size WITH tracking. */
export function trackedHeadlineWidthPx(text: string, fontPx = HERO_MAX_PX, trackingEm = OVERLAY_TEXT.trackingEm): number {
  return SUPPORTED_HEADLINES.has(text.toUpperCase()) ? headlineTextWidthPx(text, fontPx, trackingEm) : NaN
}

export type HeadlineFit = { fontPx: number; lines: string[] }

/** Hero (Template 1/3) headline sizing: FIT-TO-WIDTH per ACTUAL text. A supported {city} {type}
 *  combo renders ONE line at the largest size in [HERO_MIN_PX, HERO_MAX_PX] that fits the safe box
 *  (so short combos are larger, long ones shrink only as needed). Arbitrary/custom headlines fall
 *  back to the multi-line char-wrap at the minimum size. Shared by the render + preview (parity). */
export function headlineFit(text: string | null | undefined): HeadlineFit {
  const t = (text ?? "").trim()
  if (!t) return { fontPx: HERO_MAX_PX, lines: [] }
  if (SUPPORTED_HEADLINES.has(t.toUpperCase())) return { fontPx: fitHeadlinePx(t, HERO_MAX_PX, HERO_MIN_PX), lines: [t] }
  return { fontPx: HERO_MIN_PX, lines: wrapHeadline(t) } // custom/unknown text → char-wrap fallback
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
// Center-hook (T2/T4/T5) hook size is FIT-TO-WIDTH per actual sentence, [HOOK_MIN_PX, HOOK_MAX_PX]:
// each hook renders at the largest size that fits ONE line in the 900px safe box (short hooks larger,
// the longest supported hook "Your sign to get that rental home in San Antonio" shrinks only as
// needed — never wrapped or stacked). When a center-hook template carries a detail line (T5 Upgrade),
// the detail uses `detailFontPx` (smaller than the hook, Bodoni-Detail) so the hook stays dominant.
// Shared by preview + render (parity).
export const CENTER_HOOK = { maxPx: HOOK_MAX_PX, minPx: HOOK_MIN_PX, lineSpacing: 8, detailFontPx: 30 } as const

// Template 1 (market_type) renders its "Starting at $X/mo" detail LARGER than the shared HERO detail
// (OVERLAY_SPEC.sub.fontPx) so the price reads as a true secondary headline. ONLY Template 1 uses
// this — Template 3 (special_feature) keeps the shared sub size. All test prices stay one line.
export const MARKET_TYPE_DETAIL_PX = 52

export function templateFamily(template: string): LayoutFamily {
  if (template === "your_sign" || template === "next_property" || template === "pov_upgrade" || template === "affordable_luxury") return "center_hook"
  if (template === "upgrade" || template === "pov_price") return "center_hook_detail"
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
      const heroGapPx = template === "special_feature" ? SPECIAL_FEATURE_GAP_PX : OVERLAY_SPEC.sub.gapPx // T3 hugs headline; T1 unchanged
      const detailTop = headTop + headlineBlockPx(Math.max(1, fit.lines.length), fit.fontPx) + heroGapPx
      const detailPx = template === "market_type" ? MARKET_TYPE_DETAIL_PX : OVERLAY_SPEC.sub.fontPx // T1 price is larger; T3 keeps the shared size
      detailBlock = { lines: wrapSub(detail), fontPx: detailPx, topPx: detailTop, uppercase: false, sideMarginPx: OVERLAY_SPEC.sub.sideMarginPx, lineSpacing: OVERLAY_SPEC.sub.lineSpacing }
    }
    return { family, headline, detail: detailBlock }
  }

  // Center hook (+ optional detail) — the hook is ONE line, FIT-TO-WIDTH per actual sentence (no
  // wrapping, no manual breaks). Vertically center the group.
  const oneLine = (headlineText ?? "").replace(/\s+/g, " ").trim()
  const lines = oneLine ? [oneLine] : []
  const hookPx = oneLine ? fitHeadlinePx(oneLine, CENTER_HOOK.maxPx, CENTER_HOOK.minPx) : CENTER_HOOK.maxPx
  const n = Math.max(1, lines.length)
  const headBlockH = n * hookPx + (n - 1) * CENTER_HOOK.lineSpacing
  const hasDetail = family === "center_hook_detail" && detail.length > 0
  // Detail is ONE line, FIT-TO-WIDTH (Bodoni-Detail) at a larger price-detail size that stays below
  // the hook (see centerHookDetailMaxPx) so it reads as a strong-but-secondary line. Shrinks only if
  // an unusually long detail needs it; never wraps/stacks.
  const detailPx = hasDetail ? fitDetailPx(detail, centerHookDetailMaxPx(template, hookPx), CENTER_HOOK_DETAIL_MIN) : CENTER_HOOK.detailFontPx
  const detailLines = hasDetail ? [detail] : []
  const detailBlockH = hasDetail ? detailPx : 0 // one line
  const gap = hasDetail ? CENTER_HOOK_DETAIL_GAP_PX : 0 // tighter lockup below the hook (T5/T8)
  const totalH = headBlockH + gap + detailBlockH
  const groupTop = (H - totalH) / 2
  const headline: OverlayBlock = { lines, fontPx: hookPx, topPx: groupTop, uppercase: false, sideMarginPx: OVERLAY_SPEC.headline.sideMarginPx, lineSpacing: CENTER_HOOK.lineSpacing }
  const detailBlock: OverlayBlock | null = hasDetail
    ? { lines: detailLines, fontPx: detailPx, topPx: groupTop + headBlockH + gap, uppercase: false, sideMarginPx: OVERLAY_SPEC.sub.sideMarginPx, lineSpacing: OVERLAY_SPEC.sub.lineSpacing }
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
