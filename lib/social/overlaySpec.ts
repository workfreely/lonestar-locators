// Social Autopilot — ONE overlay spec shared by the FFmpeg renderer and the editing preview,
// so the on-screen preview matches the burned-in output. Geometry is expressed against the
// 1080×1920 (9:16) Reel canvas as fractions, plus font sizes in canvas pixels. Safe area keeps
// text clear of the Reel UI (top actions, bottom caption/controls).

import { COMPOUND_TYPE_QUALIFIERS } from "@/lib/social/propertyTypes"

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
  // 0 = NO tracking. FFmpeg drawtext has no letter-spacing parameter, so the burned-in video has never
  // had any; the old 0.02em (a Bodoni-era value) therefore existed only in the CSS preview AND as a
  // phantom width budget in headlineTextWidthPx/detailTextWidthPx — the fitter measured text ~2% wider
  // than FFmpeg draws it and paid for the difference by choosing a SMALLER font size. At 0 the
  // measurement equals what is actually rendered, so preview width === render width for the first
  // time, and each headline recovers the size the phantom budget was consuming. Deliberately NOT
  // negative: the render ignores tracking, so a negative value would let the fitter over-size text
  // until it ran past the 90px safe margins (verified: -0.01em overflowed all three test headlines).
  trackingEm: 0,
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
// maxChars is annotated `number` (not inferred from the `as const` spec's literal 16) so callers can
// pass a computed per-line budget — the center-hook overflow branch does. Default unchanged.
export function wrapHeadline(text: string | null | undefined, maxChars: number = OVERLAY_SPEC.headline.maxChars): string[] {
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
// from a baked per-character ADVANCE map (advance px at 100px in LibreBaskerville-Head, wght 700) — summing
// advances exactly equals FFmpeg drawtext's line width (drawtext applies no kerning), and adding the
// same trackingEm the CSS preview uses makes the fit conservative for the browser too. So the SAME
// pure function resolves the SAME px for a given (text) in both paths — no preview/render bait-and-
// switch. The result is larger, lighter, editorial headlines that only shrink when the words require.
//
// Usable text width = canvas − 2·sideMargin (no background box, so no box padding).
export const HEADLINE_TEXT_AVAIL_PX = OVERLAY_CANVAS.w - 2 * OVERLAY_SPEC.headline.sideMarginPx // 900 (90px margins)

// Hero (T1/T3) fit range and Center-hook (T2/T4/T5) fit range, in canvas px.
// HERO_MAX_PX is UNCHANGED, so every headline that already fit keeps its exact size (21 of the 35
// supported {city} {type} combos still render at 66). HERO_MIN_PX dropped 56 → 47 purely as headroom
// for the fit-to-width system: Libre Baskerville Bold is ~12.9% wider than Bodoni, and six of the
// longest combos ("SAN ANTONIO RENTAL HOMES" worst at 1058px) could no longer reach the 900px safe box
// before hitting the old floor — fitHeadlinePx returns minPx as a FALLBACK without testing it, so they
// would have rendered past the safe margins. This lets the existing responsive sizing keep them inside
// the box instead of moving the overlay. It cannot shrink anything that already fit (fitHeadlinePx
// returns the LARGEST px that fits, scanning down from max). Optically the drop is near-neutral:
// Libre Baskerville's x-height is 53% of em vs Bodoni's 46%, so LB at 47px carries the same x-height
// as Bodoni at ~54px.
export const HERO_MAX_PX = 66, HERO_MIN_PX = 47

// ── COMPOUND Social-only types ("{QUALIFIER} {HEAD NOUN}": Split-Level / Industrial-Style) ─────────
// A compound hero headline is "{CITY} {QUALIFIER} {TYPE_PLURAL}" — e.g. "SAN ANTONIO INDUSTRIAL-STYLE
// APARTMENTS" (39 chars) vs the longest pre-existing combo "SAN ANTONIO RENTAL HOMES" (24). They are
// 40–60% wider, so they cannot reach the 900px safe box before HERO_MIN_PX (47) and would otherwise
// take the multi-line char-wrap fallback, splitting the qualifier from its noun. These two constants
// apply ONLY when the headline carries a compound qualifier — every pre-existing headline still fits
// in [HERO_MIN_PX, HERO_MAX_PX] with byte-identical output, because HERO_MIN_PX/HERO_MAX_PX are
// untouched and the compound branch is gated on the qualifier marker.
//
// COMPOUND_HERO_MIN_PX 30: the measured worst case ("SAN ANTONIO INDUSTRIAL-STYLE APARTMENTS") needs
// exactly 30px to fit 900px on one line. Below that the wrap fallback is still the safety net.
export const COMPOUND_HERO_MIN_PX = 30
// NOTE: COMPOUND_HERO_DETAIL_MIN_PX (26) was removed with the one-line compound hero. The two-line
// title keeps every compound line in the normal 44–66 range, so the hero detail needs no exception.

// Matches a compound qualifier anywhere in a headline, case-insensitively, tolerating the hyphen or a
// space ("INDUSTRIAL-STYLE" / "Industrial Style"). Derived from COMPOUND_TYPE_QUALIFIERS so adding
// another qualified family in propertyTypes.ts needs no change here.
const COMPOUND_HEADLINE_RE = new RegExp(
  COMPOUND_TYPE_QUALIFIERS.map((q) => q.replace(/-/g, "[\\s-]?")).join("|"),
  "i",
)

/** True when `text` is a COMPOUND-type headline (carries a Split-Level / Industrial-Style qualifier),
 *  which unlocks the compound-only hero fitting + detail coupling. Non-compound text is never
 *  affected, so pre-existing property types keep their exact production typography. */
export function isCompoundHeadline(text: string | null | undefined): boolean {
  return COMPOUND_HEADLINE_RE.test(text ?? "")
}
// Conversational ceiling. 46 -> 28: at 46 the short hooks (T11/T3/T13) dominated the frame; 28 is the
// intended conversational scale, letting the footage stay dominant. HOOK_MIN_PX is kept only for the
// exported range assertions — the live floor is HOOK_FLOOR_PX below.
export const HOOK_MAX_PX = 28, HOOK_MIN_PX = 22

// Per-character advance (px) at 100px in LibreBaskerville-Head.ttf (Libre Baskerville Bold, wght 700,
// unitsPerEm 1000). Covers the full headline vocabulary (A–Z, a–z, space, hyphen, colon, apostrophe).
// Any other char falls back to a mid advance (safe: slight over-estimate → shrinks a hair more, never
// clips).
//
// REGENERATED from the shipped font file, not adapted from Bodoni: Libre Baskerville Bold is ~12.9%
// wider per character on average (min 0.80×, max 1.33×), so reusing Bodoni's advances would have
// under-measured every headline and let text run past the safe box in BOTH paths. The generator
// (advance_units / unitsPerEm × 100, rounded) was validated by reproducing the previous Bodoni map
// exactly — 56/56 characters — before being run against Libre Baskerville.
// COMPLETE for the headline vocabulary — a sweep of every template × market × property type × price
// emits exactly " $',-./0123456789:" plus letters, and all of it is covered below. Digits, "$", ","
// and "/" were previously absent and fell through to ADV_FALLBACK (55) — badly wrong for the
// price-bearing templates (T15/T16), where the true advances are 0:76, 1:44, $:64, ",":26, "/":48.
const HEAD_ADV: Record<string, number> = {
  A: 81, B: 80, C: 82, D: 92, E: 76, F: 69, G: 88, H: 94, I: 43, J: 41, K: 82, L: 76, M: 114, N: 94, O: 94, P: 72, Q: 95, R: 82, S: 66, T: 83, U: 88, V: 80, W: 123, X: 85, Y: 76, Z: 80,
  a: 57, b: 67, c: 56, d: 69, e: 58, f: 44, g: 61, h: 71, i: 36, j: 33, k: 66, l: 36, m: 111, n: 73, o: 66, p: 70, q: 67, r: 50, s: 47, t: 38, u: 71, v: 62, w: 89, x: 65, y: 65, z: 57,
  "0": 76, "1": 44, "2": 65, "3": 64, "4": 66, "5": 60, "6": 67, "7": 52, "8": 64, "9": 67,
  " ": 27, ".": 26, ",": 26, $: 64, "/": 48, "·": 28, ":": 28, "'": 21, "-": 46,
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
// (The old per-template center-hook detail table — a 38–40px target capped at hook − 2 — was replaced
//  by the proportional hookDetailPxFor() below, which keeps one constant ratio at every hook size.)
// Gap below the hook for center-hook + detail: tighter than the Hero sub gap so the two lines read as
// ONE lockup instead of two separated elements. Both tightened by 4px (16→12, 21→17) now that the
// supporting line sits at 27px against a 28px hook — at near-equal sizes the old gaps read as two
// separate elements rather than one lockup. Their 5px relative offset is preserved.
//
// The group is VERTICALLY CENTERED, so shrinking the gap does not move the lockup: its centre is
// unchanged and only the internal spacing closes (headline +2px, detail −2px). Hero gaps
// (SPECIAL_FEATURE_GAP_PX / MARKET_TYPE_GAP_PX / OVERLAY_SPEC.sub.gapPx) are NOT affected.
const CENTER_HOOK_DETAIL_GAP_PX = 12
// Upgrade (T6) and its Apartment Standards variant (T7) ONLY — a slightly looser gap so the headline
// + special/price get a little breathing room. Every other center-hook keeps CENTER_HOOK_DETAIL_GAP_PX.
const UPGRADE_DETAIL_GAP_PX = 17
// Hero gaps (per template): T4 Special + Feature hugs the headline; T1/T2 Market + Type is a touch
// looser because their detail is larger at 52px. Other hero templates keep OVERLAY_SPEC.sub.gapPx
// (unreachable today — the hero family is exactly T1/T2/T4).
//
// Both tightened by 2px only (18→16, 24→22) — a deliberately subtler adjustment than the 4px applied
// to the conversational gaps, because hero spacing was already close to right. T1/T4 are top-anchored
// so their headline does not move at all and only the detail rises 2px; T2 is centred, so its lockup
// centre is likewise unchanged. Hero FONT SIZES and fitting are untouched.
const SPECIAL_FEATURE_GAP_PX = 16
const MARKET_TYPE_GAP_PX = 22

// Supported Hero vocabulary ({CITY} {TYPE_PLURAL}, uppercase) → renders one line (fit-to-width);
// any headline NOT in this set (arbitrary/custom) falls back to the multi-line char-wrap.
const SUPPORTED_HEADLINES: ReadonlySet<string> = new Set([
  "AUSTIN STUDIOS", "AUSTIN APARTMENTS", "AUSTIN HIGH-RISES", "AUSTIN TOWNHOMES", "AUSTIN RENTAL HOMES", "AUSTIN PENTHOUSES", "AUSTIN LOFTS",
  "DALLAS STUDIOS", "DALLAS APARTMENTS", "DALLAS HIGH-RISES", "DALLAS TOWNHOMES", "DALLAS RENTAL HOMES", "DALLAS PENTHOUSES", "DALLAS LOFTS",
  "DFW STUDIOS", "DFW APARTMENTS", "DFW HIGH-RISES", "DFW TOWNHOMES", "DFW RENTAL HOMES", "DFW PENTHOUSES", "DFW LOFTS",
  "HOUSTON STUDIOS", "HOUSTON APARTMENTS", "HOUSTON HIGH-RISES", "HOUSTON TOWNHOMES", "HOUSTON RENTAL HOMES", "HOUSTON PENTHOUSES", "HOUSTON LOFTS",
  "SAN ANTONIO STUDIOS", "SAN ANTONIO APARTMENTS", "SAN ANTONIO HIGH-RISES", "SAN ANTONIO TOWNHOMES", "SAN ANTONIO RENTAL HOMES", "SAN ANTONIO PENTHOUSES", "SAN ANTONIO LOFTS",
])

/** Largest size in [COMPOUND_HERO_MIN_PX, HERO_MAX_PX] at which a COMPOUND hero headline fits the
 *  900px safe box on ONE line, or null when even the floor overflows (caller falls back to wrapping).
 *  The floor is TESTED, so this never returns a size that runs past the safe margins. */
export function fitCompoundHeroPx(text: string, availPx = HEADLINE_TEXT_AVAIL_PX): number | null {
  for (let px = HERO_MAX_PX; px >= COMPOUND_HERO_MIN_PX; px--) {
    if (headlineTextWidthPx(text, px) <= availPx) return px
  }
  return null
}

/** Back-compat helper (used in tests): width of a supported headline at a size WITH tracking. */
export function trackedHeadlineWidthPx(text: string, fontPx = HERO_MAX_PX, trackingEm = OVERLAY_TEXT.trackingEm): number {
  return SUPPORTED_HEADLINES.has(text.toUpperCase()) ? headlineTextWidthPx(text, fontPx, trackingEm) : NaN
}

// `linePx` is set ONLY for the compound two-line hero, where each line carries its own size (line 1
// the market at normal hero scale, line 2 the complete compound type, shrunk only if it must be).
// When absent every line shares `fontPx` — the unchanged behaviour for all other headlines.
export type HeadlineFit = { fontPx: number; lines: string[]; linePx?: number[] }

/** Split "{MARKET} {QUALIFIER} {NOUN_PLURAL}" into [market, "QUALIFIER NOUN_PLURAL"] so the compound
 *  descriptor and its head noun always stay together on line 2. Returns null when the headline has no
 *  market prefix (the type alone), which then keeps the single-line treatment. */
export function splitCompoundHeadline(text: string): [string, string] | null {
  const m = COMPOUND_HEADLINE_RE.exec(text)
  if (!m || m.index <= 0) return null
  const market = text.slice(0, m.index).trim()
  const type = text.slice(m.index).trim()
  return market && type ? [market, type] : null
}

/** Hero (Template 1/3) headline sizing: FIT-TO-WIDTH per ACTUAL text. A supported {city} {type}
 *  combo renders ONE line at the largest size in [HERO_MIN_PX, HERO_MAX_PX] that fits the safe box
 *  (so short combos are larger, long ones shrink only as needed). Arbitrary/custom headlines fall
 *  back to the multi-line char-wrap at the minimum size. Shared by the render + preview (parity). */
export function headlineFit(text: string | null | undefined): HeadlineFit {
  const t = (text ?? "").trim()
  if (!t) return { fontPx: HERO_MAX_PX, lines: [] }
  if (SUPPORTED_HEADLINES.has(t.toUpperCase())) return { fontPx: fitHeadlinePx(t, HERO_MAX_PX, HERO_MIN_PX), lines: [t] }
  // COMPOUND Social-only types ("{CITY} SPLIT-LEVEL LOFTS", "{CITY} INDUSTRIAL-STYLE APARTMENTS").
  // Forcing the complete string onto ONE line fits, but only by dropping the hero to 30–36px, which
  // is too small for a hero title. Instead build exactly TWO lines — market, then the COMPLETE
  // compound type — and size each line independently: line 1 keeps the normal hero scale, line 2
  // starts from that same scale and shrinks only if the compound type exceeds the safe width. The
  // qualifier and its head noun are never separated, because the split point is the qualifier itself.
  // Both lines centre on the canvas axis (equal side margins + centred text in the preview, and
  // x=(w-text_w)/2 in FFmpeg), so no padding is ever applied to align them.
  if (isCompoundHeadline(t)) {
    const parts = splitCompoundHeadline(t)
    if (parts) {
      const [l1, l2] = parts
      const p1 = fitCompoundHeroPx(l1), p2 = fitCompoundHeroPx(l2)
      // fontPx is the block's NOMINAL size (the smaller line), which is what the existing hero detail
      // coupling reads — so the price line stays subordinate to the smallest title line.
      if (p1 !== null && p2 !== null) return { fontPx: Math.min(p1, p2), lines: [l1, l2], linePx: [p1, p2] }
    }
    // No market prefix (the type alone): keep the single tested-floor fit rather than inventing a break.
    const onePx = fitCompoundHeroPx(t)
    if (onePx !== null) return { fontPx: onePx, lines: [t] }
  }
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

// ── Conversational (center-hook) scale ───────────────────────────────────────────────────────────
// ONE rule: the ceiling IS the conversational scale, and the 900px safe box is the only width
// constraint. Copy renders at CENTER_HOOK.maxPx and shrinks only when a sentence genuinely cannot fit
// the box — which, at this ceiling, only ever happens to T12 (and T12 wraps instead).
//
// There used to be a second rule here: a soft HOOK_TARGET_W = 780px that long copy was fitted into,
// added when the ceiling was 46px and long sentences filled 93–99% of the frame. With the ceiling at
// 28px that target is INERT — measured across all 608 conversational headline/market/type
// combinations, the ONLY ones wider than 780px at 28px are the same 48 that also exceed the 900px box
// (all T12, which wraps). Keeping it would be two rules fighting over the same decision, so it is
// gone: negative space now comes from the ceiling itself, not from a competing width target.
//
// HERO templates (T1 / T2 / T4) do NOT use any of this — they have their own branch, their own
// [HERO_MIN_PX, HERO_MAX_PX] range and their own detail sizing, all unchanged.
const HOOK_FLOOR_PX = 22 // only reachable by copy too long for the box even at the ceiling
/** Fit conversational text inside a box, measured with the HEAD advance map. Tests the floor itself
 *  (unlike fitHeadlinePx, which returns minPx untested) so the size returned is always one that was
 *  actually measured. `availPx` lets the conversational DETAIL — which renders in the same head face —
 *  be fitted to its own wider sub box rather than the headline's. */
function fitHookPx(text: string, maxPx: number, minPx: number = HOOK_FLOOR_PX, availPx: number = HEADLINE_TEXT_AVAIL_PX): number {
  for (let px = maxPx; px >= minPx; px--) if (headlineTextWidthPx(text, px) <= availPx) return px
  return minPx
}

// Supporting/detail line for the center-hook family: a FLAT 27px, against a 28px hook.
//
// 28/27 is DELIBERATE and not an accident of some ratio. This started as a 0.75 ratio (21px), then a
// flat 24px; both tested too small for lines like "Starting at $1,500/mo" on real mobile video.
// Legibility on a phone outranks a numeric size hierarchy here — the supporting line is already
// subordinate by placement (below the hook) and by content, so it does not need to be visibly smaller
// to read as secondary. Do not "restore proportion" by shrinking this.
//
// The clamp is a safety rail, not the rule. It is hook − 1 rather than hook − 2 precisely so 27 is
// reachable at the 28px ceiling, while still guaranteeing the supporting line stays STRICTLY under the
// headline if a hook ever shrinks below the ceiling (only reachable by copy too long for the box even
// at 28px). Hero detail sizing (MARKET_TYPE_DETAIL_PX, OVERLAY_SPEC.sub.fontPx) is NOT affected.
const HOOK_DETAIL_PX = 27
const HOOK_DETAIL_MIN_PX = 20
function hookDetailPxFor(hookPx: number): number {
  return Math.min(HOOK_DETAIL_PX, Math.max(HOOK_DETAIL_MIN_PX, hookPx - 1))
}

// Template 1 (market_type) renders its "Starting at $X/mo" detail LARGER than the shared HERO detail
// (OVERLAY_SPEC.sub.fontPx) so the price reads as a true secondary headline. ONLY Template 1 uses
// this — Template 3 (special_feature) keeps the shared sub size. All test prices stay one line.
export const MARKET_TYPE_DETAIL_PX = 52

export function templateFamily(template: string): LayoutFamily {
  // what_mo_gets_you (Template 11) never has a detail line (the price+city sentence IS the whole
  // headline) — same bucket as the other no-detail center-hook templates, which shares the exact
  // hook sizing (CENTER_HOOK.maxPx/minPx/lineSpacing) Template 7 (apartment_standards) also uses.
  // what_mo_gets_you_top (T16) is that SAME center-hook treatment, only anchored at T1's top
  // position instead of vertically centered — see the topAnchored branch in computeOverlayLayout.
  if (template === "your_sign" || template === "next_property" || template === "pov_upgrade" || template === "affordable_luxury" || template === "what_mo_gets_you" || template === "what_mo_gets_you_top") return "center_hook"
  // apartment_standards is an EXACT Upgrade variant → same center-hook+detail geometry. T12–T15 join
  // them: T11's centered composition plus an OPTIONAL "Starting at $X/mo" line that collapses to a
  // headline-only render when there is no valid price (hasDetail below is text-driven, not family-driven).
  if (template === "upgrade" || template === "apartment_standards" || template === "pov_price"
    || template === "trade_up" || template === "wanted_luxury" || template === "real_living" || template === "hits_different") return "center_hook_detail"
  return "hero" // market_type, market_type_centered (vertically centered in the hero branch), special_feature, unknown → hero
}

// `face` says WHICH bundled font a block renders in, so the CSS preview and the FFmpeg render pick the
// same one. It is per-BLOCK, not per-element-role: the conversational detail renders in the HEAD face
// (Libre Baskerville Bold) while the HERO detail stays on the Bodoni text cut. Anything measuring a
// block's width must use the matching advance map — head face -> headlineTextWidthPx.
export type OverlayFace = "head" | "detail"
// PER-LINE geometry (`linePx` + `lineTopPx`, always the same length as `lines`) is present ONLY for
// the compound two-line hero. When set, each line is drawn as its OWN unit — one FFmpeg drawtext and
// one absolutely-positioned preview div at that exact top — which is what lets the two lines carry
// different sizes and still land on identical baselines in both paths. When absent (every other
// headline and every detail) the block behaves exactly as before: one unit, one size, `lineSpacing`.
export type OverlayBlock = { lines: string[]; fontPx: number; topPx: number; uppercase: boolean; sideMarginPx: number; lineSpacing: number; face: OverlayFace; linePx?: number[]; lineTopPx?: number[] }
export type OverlayLayout = { family: LayoutFamily; headline: OverlayBlock; detail: OverlayBlock | null }

/** Resolve the on-canvas (1080×1920) layout for a template + its already-computed headline/detail
 *  text. Shared by the CSS preview and the FFmpeg render so the two match. */
export function computeOverlayLayout(template: string, headlineText: string, detailText: string): OverlayLayout {
  const family = templateFamily(template)
  const H = OVERLAY_CANVAS.h
  const detail = (detailText ?? "").trim()

  if (family === "hero") {
    const fit = headlineFit(headlineText)
    // market_type_centered = T1 typography (same headline/detail size, gap, shadow, fit-to-width),
    // but the WHOLE group is vertically centered rather than anchored near the top (yFrac). It
    // reuses T1's Market+Type detail sizing/gap so only the vertical position differs.
    const centered = template === "market_type_centered"
    const usesMarketDetail = template === "market_type" || template === "market_type_centered"
    const hasDetail = detail.length > 0
    // With per-line sizes the block height is the SUM of the line sizes, not lineCount × one size.
    const headBlockH = fit.linePx
      ? fit.linePx.reduce((a, b) => a + b, 0) + (fit.linePx.length - 1) * OVERLAY_SPEC.headline.lineSpacing
      : headlineBlockPx(Math.max(1, fit.lines.length), fit.fontPx)
    const heroGapPx = template === "special_feature" ? SPECIAL_FEATURE_GAP_PX : usesMarketDetail ? MARKET_TYPE_GAP_PX : OVERLAY_SPEC.sub.gapPx
    // T1/T2 price is larger; T3 keeps the shared size. The T1 price is COUPLED to stay at least 2px
    // below the fitted headline — the same idea hookDetailPxFor applies to the
    // center-hook detail. Without it the four longest Hero combos (SAN ANTONIO APARTMENTS /
    // TOWNHOMES / RENTAL HOMES / PENTHOUSES), which fit at 47–51px in the wider Libre Baskerville,
    // would render a 52px price line LARGER than the headline it supports, inverting the hierarchy.
    // The detail FACE is unchanged (Bodoni Moda text cut) — only this size ceiling.
    const baseDetailPx = usesMarketDetail
      ? Math.min(MARKET_TYPE_DETAIL_PX, Math.max(OVERLAY_SPEC.sub.fontPx, fit.fontPx - 2))
      : OVERLAY_SPEC.sub.fontPx
    // The compound-only detail override is GONE: the two-line hero puts every compound title line back
    // in the normal 44–66 range, so the existing rule above needs no exception. It is fed the block's
    // nominal size, which for a compound title is the SMALLER of the two lines, keeping the price
    // subordinate to the smallest title line rather than only to the larger market line.
    const detailPx = baseDetailPx
    const detailLines = hasDetail ? wrapSub(detail) : []
    const detailBlockH = hasDetail ? detailLines.length * detailPx + Math.max(0, detailLines.length - 1) * OVERLAY_SPEC.sub.lineSpacing : 0
    const gap = hasDetail ? heroGapPx : 0
    const totalH = headBlockH + gap + detailBlockH
    // Anchor: near-top (yFrac) for T1; vertical center of the group for the Centered variant.
    const headTop = centered ? (H - totalH) / 2 : OVERLAY_SPEC.headline.yFrac * H
    // Per-line tops for the compound two-line title: each line's top is the running sum of the
    // PRECEDING line sizes, so a smaller line 2 sits directly under line 1 with the same gap the
    // single-size path uses. Horizontal centring is not computed here — both lines inherit the same
    // symmetric side margins and are centred by the renderer, so they share one centre axis.
    let lineTopPx: number[] | undefined
    if (fit.linePx) {
      let y = headTop
      lineTopPx = fit.linePx.map((px) => { const top = y; y += px + OVERLAY_SPEC.headline.lineSpacing; return top })
    }
    const headline: OverlayBlock = { lines: fit.lines, fontPx: fit.fontPx, topPx: headTop, uppercase: true, sideMarginPx: OVERLAY_SPEC.headline.sideMarginPx, lineSpacing: OVERLAY_SPEC.headline.lineSpacing, face: "head", linePx: fit.linePx, lineTopPx }
    let detailBlock: OverlayBlock | null = null
    if (hasDetail) {
      // HERO detail deliberately stays on the Bodoni text cut — unchanged in this pass.
      detailBlock = { lines: detailLines, fontPx: detailPx, topPx: headTop + headBlockH + gap, uppercase: false, sideMarginPx: OVERLAY_SPEC.sub.sideMarginPx, lineSpacing: OVERLAY_SPEC.sub.lineSpacing, face: "detail" }
    }
    return { family, headline, detail: detailBlock }
  }

  // Center hook (+ optional detail) — the hook is ONE line, FIT-TO-WIDTH per actual sentence (no
  // wrapping, no manual breaks). Vertically center the group.
  const oneLine = (headlineText ?? "").replace(/\s+/g, " ").trim()
  // T5 (Next Property) used to take a smaller 40px max than the shared 46px cap for side-margin
  // breathing room. At a 28px ceiling that exception is obsolete (40 > 28 would make T5 the LARGEST
  // hook, inverting its intent), so every center-hook template now shares the one ceiling.
  const hookMaxPx = CENTER_HOOK.maxPx
  // One shared floor (34) now covers every hook. It also subsumes T14's old per-template 35px floor:
  // a LOWER floor can only make one line easier to achieve, so "This is what real rental home living
  // looks like" stays single-line a fortiori (asserted in the composer tests).
  const hookMinPx = HOOK_FLOOR_PX
  let lines = oneLine ? [oneLine] : []
  let hookPx = oneLine ? fitHookPx(oneLine, hookMaxPx, hookMinPx) : hookMaxPx
  // Copy too wide for the box AT THE CEILING WRAPS rather than shrinking below the conversational
  // scale. The trigger is deliberately the CEILING, not the floor: at the floor, T12's sentence does
  // fit one line (837px at 22px) — but only by rendering ~5px smaller than every other template, which
  // is exactly the "unnecessarily tiny" outcome the scale exists to avoid. Wrapping instead keeps T12
  // at the same 28px as its siblings. Only T12 reaches this branch; every other hook fits one line at
  // the ceiling. The per-line budget comes from the real measured width (no magic constant) and breaks
  // the sentence into as FEW lines as possible, so T12 is two lines, never three.
  if (oneLine && headlineTextWidthPx(oneLine, hookMaxPx) > HEADLINE_TEXT_AVAIL_PX) {
    // BALANCED break. Packing each line to the box maximally left an orphan ("…for a" / "rental
    // home" — 877px then 92px). Take the fewest lines the width actually requires, then use the
    // SMALLEST character budget that still produces that many lines: an even split is the starting
    // guess, and the budget grows until the greedy wrapper stops over-splitting (an even split alone
    // pushed the short types to three lines). The result is the minimum line count with lines of
    // near-equal length.
    const needed = Math.max(2, Math.ceil(headlineTextWidthPx(oneLine, hookMaxPx) / HEADLINE_TEXT_AVAIL_PX))
    let perLine = Math.max(8, Math.ceil(oneLine.length / needed))
    lines = wrapHeadline(oneLine, perLine)
    while (lines.length > needed && perLine < oneLine.length) {
      perLine++
      lines = wrapHeadline(oneLine, perLine)
    }
    hookPx = Math.min(...lines.map((l) => fitHookPx(l, hookMaxPx, hookMinPx)))
  }
  const n = Math.max(1, lines.length)
  const headBlockH = n * hookPx + (n - 1) * CENTER_HOOK.lineSpacing
  const hasDetail = family === "center_hook_detail" && detail.length > 0
  // Detail is ONE line, FIT-TO-WIDTH (Bodoni-Detail) at a larger price-detail size that stays below
  // the hook (see hookDetailPxFor) so it reads as a strong-but-secondary line. Shrinks only if
  // an unusually long detail needs it; never wraps/stacks.
  // Measured with HEADLINE metrics because it now RENDERS in the head face — using the Bodoni advance
  // map here would under-measure it by ~13% and break preview/render parity. Size and box are unchanged.
  const detailPx = hasDetail ? fitHookPx(detail, hookDetailPxFor(hookPx), HOOK_DETAIL_MIN_PX, DETAIL_TEXT_AVAIL_PX) : CENTER_HOOK.detailFontPx
  const detailLines = hasDetail ? [detail] : []
  const detailBlockH = hasDetail ? detailPx : 0 // one line
  const gap = hasDetail ? (template === "upgrade" || template === "apartment_standards" ? UPGRADE_DETAIL_GAP_PX : CENTER_HOOK_DETAIL_GAP_PX) : 0 // Upgrade + its variant a touch looser; T8 stays 16
  const totalH = headBlockH + gap + detailBlockH
  // T16 (what_mo_gets_you_top) is T11 anchored near the TOP instead of vertically centered — the
  // mirror image of T2, which is T1's typography at a centered anchor. Only the anchor differs, and it
  // reuses T1's own yFrac constant, so the hook typography/fit stays identical to T11's.
  const topAnchored = template === "what_mo_gets_you_top"
  const groupTop = topAnchored ? OVERLAY_SPEC.headline.yFrac * H : (H - totalH) / 2
  const headline: OverlayBlock = { lines, fontPx: hookPx, topPx: groupTop, uppercase: false, sideMarginPx: OVERLAY_SPEC.headline.sideMarginPx, lineSpacing: CENTER_HOOK.lineSpacing, face: "head" }
  const detailBlock: OverlayBlock | null = hasDetail
    ? { lines: detailLines, fontPx: detailPx, topPx: groupTop + headBlockH + gap, uppercase: false, sideMarginPx: OVERLAY_SPEC.sub.sideMarginPx, lineSpacing: OVERLAY_SPEC.sub.lineSpacing, face: "head" }
    : null
  return { family, headline, detail: detailBlock }
}

// REMOVED: overlayPreviewStyle(). It was the pre-template editing-preview helper, and by the end only
// BulkReview still used it — hand-rolling its own overlay from wrapHeadline() + a FIXED 66px size,
// which bypassed fit-to-width and rendered long headlines as stacked ≤16-char lines while the burn-in
// drew one fitted line. Every overlay surface now goes through computeOverlayLayout + <PreviewOverlay>,
// so there is exactly ONE geometry path and a preview cannot drift from the render. Do not reintroduce
// a second px→% helper; add to computeOverlayLayout instead.
