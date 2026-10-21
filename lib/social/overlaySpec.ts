// Social Autopilot — ONE overlay spec shared by the FFmpeg renderer and the editing preview,
// so the on-screen preview matches the burned-in output. Geometry is expressed against the
// 1080×1920 (9:16) Reel canvas as fractions, plus font sizes in canvas pixels. Safe area keeps
// text clear of the Reel UI (top actions, bottom caption/controls).

import { COMPOUND_TYPE_QUALIFIERS } from "@/lib/social/propertyTypes"
import { safeAreaFor, sideMarginPx, textAvailPx, DEFAULT_PLATFORM } from "@/lib/social/platformSafeArea"

export const OVERLAY_CANVAS = { w: 1080, h: 1920 } as const

// Reels-safe overlay geometry. Each text element has a CENTERED max-width box (never
// edge-to-edge): the box width = canvas − 2·sideMarginPx, and text is greedily wrapped to
// `maxChars` (chosen so a full line ≈ the box width at that font) with an even harder per-word
// character break so nonsense/no-space text can never run off-screen. The SAME wrap drives both
// the CSS preview and the FFmpeg render (FFmpeg centers each line via x=(w-text_w)/2, so the
// char-wrap is what constrains its width to the box). Headline box ≈ 800px, sub box ≈ 930px.
// ── THE TOP ANCHOR (yFrac) AND INSTAGRAM'S GRID CROP ────────────────────────────────────────
// yFrac positions EVERY top-anchored lockup: T1 market_type, T4 special_feature and T16
// what_mo_gets_you_top. All three sit at the same position by design, so they read as one family
// on the profile grid. T2 market_type_centered is the same typography as T1 but vertically
// centred, so it does not read this and is unaffected.
//
// It was 0.13 (y 249.6), which looked right in the full-frame Reel and WRONG on the profile grid.
// Instagram crops a 1080x1920 Reel to a CENTRED 3:4 thumbnail — measured from a real profile
// screenshot (1320x2868), cells 438x584 = exactly 3:4, so the visible canvas band is y 240..1680
// and 240px is cut off the top. The headline box sat at 249.6, just 10px inside that cut, and its
// glyph ink at 254.8 — measured in the same screenshot. In the grid the title read as jammed
// against the edge.
//
// 0.175 (box at 336, +96px below the cut) was measured to clear the crop, and still read as too
// high on a real profile grid. Measurement said "not clipped"; the eye said "not placed". The eye
// is the requirement here, so this is set visually rather than to the minimum that technically
// survives the crop.
//
// 0.25 put the box at 480 — 240px below the crop line, one sixth of the 1440px visible band. That
// was right for the grid and slightly low in the other two contexts, which is the trade-off this
// value has to make: Instagram is THREE viewing contexts, not one.
//
//   profile grid   — the only HARD constraint. Centred 3:4 crop, visible band y240..1680, so the
//                    top 240px never appears and the anchor must stay well clear of y240.
//   feed/scrolling — presents the frame essentially uncropped, so the 240px of headroom the grid
//                    hides is visible here. The same anchor therefore reads LOWER in the feed than
//                    in the grid; that difference is inherent, not a bug to tune away.
//   full-screen    — also uncropped, with the player's chrome over the top of the frame.
//
// The anchor then walked up in measured steps, each one a VISUAL call checked against a real
// published Reel rather than a derivation: 480 -> 462 -> 447 -> 427. Every step was judged on the
// SCROLLING/FEED view, which is the context that shows the frame uncropped and therefore the one
// where excess headroom reads as "too low".
//
// 427/1920 is the settled value. It keeps 187px of grid clearance above the lockup — still well
// inside the crop — and the deepest lockup the engine can produce (T1, 3-line headline + 4-line
// detail) bottoms out at y804 against a crop bottom of 1680.
//
// WRITTEN AS A DIVISION ON PURPOSE. 427 is not a clean fraction of 1920: the decimal needs all 17
// significant digits (0.22239583333333332) to multiply back to exactly 427, and one digit short
// (0.2223958333333333) yields 426.99999999999994, which puts FRACTIONAL coordinates into every
// drawtext y in the render. `427 / 1920` is exact, self-documenting, and cannot be broken by
// someone tidying up a long decimal. Keep this form if the anchor moves again.
//
// ⛔ FROZEN — APPROVED PRODUCTION BASELINE, 2026-10-08.
//
// y427 is signed off after four measured steps (480 → 462 → 447 → 427), each one rendered and
// published as a real Reel and judged on the live profile grid, feed and full-screen views. This
// is the approved geometry for T1 market_type, T4 special_feature and T16 what_mo_gets_you_top.
//
// DO NOT re-tune this value, the fonts, the sizing, the margins, the line spacing or the
// headline-to-price gap as a side effect of other work, and do not "improve" it on your own
// judgement. It is reopened only by an explicit instruction from Jay to do so.
//
// T2 market_type_centered keeps its CENTERED position and is unaffected by this constant: the
// centered branch resolves (H - totalH) / 2 and never reads yFrac (T1 y427 vs T2 y890, verified).
// Same for T15 what_mo_gets_you, the centered sibling of T16.
//
// Do NOT re-derive this from a screenshot ink scan. Recovering burned-in text positions from
// Instagram's compressed thumbnails was tried and is not reliable — it produced y302 for a frame
// provably rendered at y480, because the scan catches thumbnail artefacts and Instagram's own grid
// chrome, not our glyphs. The grid CELL geometry (sharp UI gutters) is measurable; the text inside
// it is not. Take the anchor from this constant and the lockup extents from computeOverlayLayout.
//
// ONLY THE ANCHOR MOVED. Font, size, weight, line spacing, the horizontal fit box
// (sideMarginPx/HEADLINE_TEXT_AVAIL_PX) and the headline-to-price gap (MARKET_TYPE_GAP_PX) are all
// untouched — the whole lockup translates down as one unit, so the internal composition is
// identical. The hero side margin was deliberately NOT widened: the fit box IS what sets the
// fitted size, so narrowing it would have re-fitted 49 of 70 headlines smaller by a median 18px.
export const OVERLAY_SPEC = {
  // Template 1/3 (Hero) headline size is FIT-TO-WIDTH per actual text (see headlineFit): each combo
  // renders at the largest size in [HERO_MIN_PX, HERO_MAX_PX] that fits one line in the 900px safe box,
  // so "SAN ANTONIO TOWNHOMES" is larger than "SAN ANTONIO RENTAL HOMES". `fontPx` here is the START/
  // MAX (HERO_MAX_PX) used as the block default; the actual per-headline size comes from headlineFit.
  // maxChars/maxLines are the FALLBACK char-wrap for arbitrary/custom headline text only.
  headline: { yFrac: 427 / 1920, fontPx: 66, lineSpacing: 8, boxAlpha: 0.32, boxBorderPx: 24, maxChars: 16, maxLines: 3, sideMarginPx: 90 },
  // The sub/detail sits `gapPx` BELOW the headline block; it is the SECONDARY line, in the same
  // Libre Baskerville Bold face as the headline and distinguished by SIZE alone. 44px (raised from 36) makes "Starting at $X/mo" clearly readable and intentional in the
  // editor/enlarged preview and the render, while staying clearly secondary to the headline (56–66).
  // Its safe box is ≈86% of the canvas (930px; 75px margins each side). maxChars/maxLines unchanged.
  sub: { gapPx: 35, fontPx: 44, lineSpacing: 6, boxAlpha: 0.28, boxBorderPx: 16, maxChars: 33, maxLines: 4, sideMarginPx: 75 },
  safe: { topFrac: 0.1, bottomFrac: 0.2 },
} as const

// NOTE ON THE FONT: there is exactly ONE overlay face — LIBRE BASKERVILLE BOLD (OFL, wght 700),
// bundled as a single static cut and used for the headline AND the detail line.
//
// This comment previously described Bodoni Moda as the active face and went on saying so long after
// it was not, which is precisely how a Bodoni detail line survived unnoticed. Bodoni is a Didone:
// its hairline strokes are the first thing a lossy re-encode destroys, which made secondary copy
// read as thin and decorative over video. It is now removed from the system entirely — see
// OverlayFace, which has a single member so a second face cannot be selected.
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
  // NO outline. The 1px white stroke trialled here was compensation for FFmpeg drawtext laying down
  // ~13% less ink than the browser preview; with Chromium owning the rasterization that deficit does
  // not exist, so the compensation is not carried forward. Libre Baskerville Bold 700 stands on its own.
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
  // HARD LINE BREAKS ARE HONOURED FIRST.
  //
  // A "\n" used to be swallowed by the /\s+/ split below and treated as an ordinary space, so a
  // headline written as two deliberate lines was re-flowed into whatever the width allowed. T20's
  // Client/Me exchange needs the break to survive — the second line is the punchline, and it only
  // lands on its own line.
  //
  // For any text WITHOUT a newline this is a no-op: one segment in, the same wrapping out, so all
  // seventeen existing templates are byte-identical.
  const segments = (text ?? "").split("\n")
  if (segments.length > 1) {
    const out: string[] = []
    for (const seg of segments) {
      if (out.length >= maxLines) break
      // Each segment wraps on its own, then the next break starts a new line regardless.
      out.push(...wrapWords(seg, maxChars, maxLines - out.length))
    }
    return out.slice(0, maxLines)
  }
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

// Compound two-line hero HIERARCHY. The compound property-type line is the fit driver (it is always
// the wider of the two), and the market line sits ~18% above it, capped at the normal hero max. Equal
// sizes read flat; market pinned at 66 read as headline + subtitle. 1.18 gives a subtle step:
// property 44 → market 52, 55 → 65, 56 → 66 (capped), 66 → 66.
export const COMPOUND_MARKET_SCALE = 1.18
// The detail must stay visibly BELOW the property-type line. The normal hero rule floors at 44
// (OVERLAY_SPEC.sub.fontPx), which at a 44px property line made the price exactly as large as the
// title it supports. 0.85 keeps the step proportional at every size: property 44 → 37, 55 → 47,
// 56 → 48, 66 → 52 (the existing 52 ceiling). It only ever REDUCES the existing rule's result, never
// raises it, so a compound detail can never exceed what a non-compound one would be.
export const COMPOUND_DETAIL_SCALE = 0.85
export const COMPOUND_DETAIL_MIN_PX = 26
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
// Conversational ceiling. History: 46 -> 28 (at 46 the short hooks dominated the frame), then
// 28 -> 38 after a live Instagram test showed 28 was substantially too small on an actual phone —
// ~1.5% of frame height, which reads as thin and barely legible over bright footage regardless of
// the Bold face. 38 was chosen from a measured sweep over all 42 existing conversational posts:
// it is the largest ceiling that keeps the COMMON case on one line (36/42), invokes shrink-to-fit
// on nothing, and overflows nothing. 40 was rejected — it wraps 12/42 including the average-length
// headline, for no visible gain.
// HOOK_MIN_PX is kept only for the exported range assertions — the live floor is HOOK_FLOOR_PX below.
export const HOOK_MAX_PX = 38, HOOK_MIN_PX = 22

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

// ── Detail box width ─────────────────────────────────────────────────────────────────────────
// The detail's safe box. This is GEOMETRY — canvas minus the sub margins — and has nothing to do
// with which typeface fills it, so it survives the removal of the Bodoni metrics below.
export const DETAIL_TEXT_AVAIL_PX = OVERLAY_CANVAS.w - 2 * OVERLAY_SPEC.sub.sideMarginPx // 930 (75px margins)

// The detail line is MEASURED WITH HEAD METRICS because it renders in the head face. The former
// DETAIL_ADV advance map, detailTextWidthPx and fitDetailPx are deleted: they described Bodoni
// Moda, were already unreachable from computeOverlayLayout, and keeping a Bodoni-shaped measuring
// tape around would quietly mis-size anything that picked it up again.
// (The old per-template center-hook detail table — a 38–40px target capped at hook − 2 — was replaced
//  by the proportional hookDetailPxFor() below, which keeps one constant ratio at every hook size.)
// ── ONE headline→detail gap for the whole conversational family ──────────────────────────────────
// There used to be TWO constants here: 12px for most center-hook templates and 17px for Upgrade (T6)
// and Apartment Standards (T7). Nothing distinguished those two groups visually — they share a face,
// a hook size and a detail size — so the split was drift, not design, and it showed: against T7 the
// 12px templates (T10 pov_price, T11 hits_different, T12 trade_up, T13 wanted_luxury, T14
// real_living) read as visibly too tight, the headline and its price line crowding into each other.
//
// Measured, at the shared 38px hook:
//     T7  apartment_standards   17px  = 0.447em   <- the approved reference
//     T10 pov_price             12px  = 0.316em   <- 29% tighter, the reported problem
//
// A FIXED PIXEL GAP, not a ratio.
//
// This was briefly a ratio (0.447em), on the reasoning that a fit-to-width hook varies in size so a
// proportional gap would keep the SEPARATION constant. Measured across all 280 market × type ×
// price combinations, that produced SIX different gaps — 12, 13, 14, 15, 16 and 17px — because the
// hook shrinks for long copy (T14 fits anywhere from 27px to 38px). "Proportionally constant" and
// "identical" are not the same property, and the one that was asked for, and that the eye checks
// when two templates sit side by side in a feed, is identical.
//
// So: one number, applied to every compatible template, with nothing to recompute per template or
// per headline. 17px is Template 7's approved value, which is what makes this a standardisation
// rather than a retune — T6/T7 do not move at all.
//
// EXPLICITLY NOT GLYPH-AWARE. The measured INK separation still varies with content: a headline
// whose centre carries descenders (T10's "high-rise living") shows ~11.75px of visible space where
// one without them (T7's "…standards…") shows ~23px, at the same 17px box gap. Compensating for
// that would make spacing depend on which letters a sentence happens to contain — content-specific
// geometry, the opposite of a shared rule — so it is deliberately not done. Constant baseline
// spacing with descenders intruding is ordinary typographic behaviour.
export const DETAIL_GAP_PX = 17
/** The headline→detail gap. One value; the argument list is empty by design — there is nothing a
 *  caller could pass that is allowed to change it. Shared by preview + render (parity). */
export function detailGapPx(): number {
  return DETAIL_GAP_PX
}
// ── HERO FAMILY (T1 / T2 / T4) — DELIBERATELY NOT on DETAIL_GAP_EM ───────────────────────────────
// These keep their own tuned gaps. The shared ratio was evaluated for them and is NOT structurally
// safe here, for four reasons that are properties of the layout, not preferences:
//
//   1. The hero DETAIL WRAPS (wrapSub, up to sub.maxLines). The conversational detail is always
//      exactly one line. "Gap to the detail line" is a different measurement when the thing below
//      can be four lines tall.
//   2. The hero headline can carry PER-LINE sizes (linePx, the compound two-line title), so there is
//      no single "the headline size" to take a fraction of — fit.fontPx is only the property line.
//   3. Hero detail size is ALREADY coupled to the headline size (fit.fontPx - 2, and
//      COMPOUND_DETAIL_SCALE). Layering a ratio gap on top couples the same two numbers twice.
//   4. T1/T4 are TOP-ANCHORED (yFrac), so changing the gap MOVES the detail down the frame. The
//      conversational family is vertically centred, where a gap change redistributes around a fixed
//      centre and the lockup does not move. The same ratio has a different visual consequence.
//
// Measured, for the record: at the 57px hero hook the shared ratio would give 25px, against 22px
// today for T1/T2 and 16px for T4 — a 56% increase on T4's approved spacing. That is a visible
// change to the frozen hero hierarchy, which nothing reported as wrong.
//
// Per-template: T4 Special + Feature hugs the headline; T1/T2 Market + Type is a touch looser
// because their detail is larger at 52px. Other hero templates keep OVERLAY_SPEC.sub.gapPx
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
      // HIERARCHY: the compound property-type line (line 2) is the FIT DRIVER — it is the wider line,
      // so its largest safe size sets the lockup. The market line then steps ~18% above it, capped at
      // the normal hero max AND at the market's own safe fit (p1), so a hypothetical very long market
      // can still only render at a size that fits. Both lines belong to one title; the step is subtle.
      if (p1 !== null && p2 !== null) {
        const propertyPx = p2
        const marketPx = Math.min(HERO_MAX_PX, p1, Math.round(propertyPx * COMPOUND_MARKET_SCALE))
        // fontPx (the block's nominal size) is the PROPERTY line, because that is what the detail
        // couples off. linePx stays explicit because the per-line tops are what make the preview and
        // FFmpeg agree exactly: FFmpeg's multi-line spacing derives from the font's own ascent/descent,
        // not fontPx + lineSpacing, so a single multi-line draw would place line 2 at a y neither path
        // could predict from the geometry.
        return { fontPx: propertyPx, lines: [l1, l2], linePx: [marketPx, propertyPx] }
      }
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
// the detail uses `detailFontPx` (smaller than the hook) so the hook stays dominant.
// Shared by preview + render (parity).
export const CENTER_HOOK = {
  maxPx: HOOK_MAX_PX, minPx: HOOK_MIN_PX, lineSpacing: 8, detailFontPx: 30,
} as const

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

// ── T16 SHARES THE TOP-ANCHOR FAMILY POSITION ───────────────────────────────────────────────────
// what_mo_gets_you_top is the conversational treatment (38px, sentence case) positioned at the top
// rather than centred. It was briefly given its own anchor so a hero change could not drag it —
// but the requirement is the opposite: every top-anchored template, whatever its type size, should
// sit at ONE shared safe position so the three read as a family on the profile grid.
//
// So it reads OVERLAY_SPEC.headline.yFrac again, deliberately. There is exactly one top anchor.
// Retained as the documented statement that T16 shares T1's anchor; the live value now comes
// from topAnchorPx(platform), which resolves that same expression for Instagram.
const CENTER_HOOK_TOP_YFRAC = OVERLAY_SPEC.headline.yFrac

// ── Conversational safe box ──────────────────────────────────────────────────────────────────
// Now PER PLATFORM — see lib/social/platformSafeArea.ts, where the Instagram numbers are measured
// from a real published Reel rather than estimated. Instagram's box is 860px (110px margins): the
// engagement rail starts at x978, and the old 900px box let a fitted headline reach x990, i.e.
// under the icons.
//
// This export keeps the Instagram width available as the module-level default so existing callers
// and tests read unchanged; the platform-aware values come from safeAreaFor().
//
// A matching HOOK_SIDE_MARGIN_PX was removed: the live margin comes from sideMarginPx(platform) at
// the point the block is built, so a module-level constant could only ever restate Instagram's and
// would read as configuration the layout respects when nothing consumed it.
//
// Deliberately NOT a change to OVERLAY_SPEC.headline.sideMarginPx: that constant is shared with the
// HERO family, whose typography is out of scope here.
export const HOOK_TEXT_AVAIL_PX = textAvailPx(DEFAULT_PLATFORM) // Instagram: 860

// A one-line headline shrinks to fit rather than wrapping — "largest size that keeps it on one
// line" is the rule, not a single flat size. This is the floor below which shrinking stops being
// worth it and a wrap reads better.
//
// 26 is not arbitrary. Across all 101 generated conversational headlines the required one-line size
// falls in two clusters with a gap at 26: the trade_up family needs 18–25px (half the ceiling —
// genuinely too small, and it is the family already designed as two-line), while everything else
// needs 27px or more. 26 separates them without clipping either group.
const HOOK_ONE_LINE_MIN_PX = 26
/** Fit conversational text inside a box, measured with the HEAD advance map. Tests the floor itself
 *  (unlike fitHeadlinePx, which returns minPx untested) so the size returned is always one that was
 *  actually measured. `availPx` lets the conversational DETAIL — which renders in the same head face —
 *  be fitted to its own wider sub box rather than the headline's. */
function fitHookPx(text: string, maxPx: number, minPx: number = HOOK_FLOOR_PX, availPx: number = HEADLINE_TEXT_AVAIL_PX): number {
  for (let px = maxPx; px >= minPx; px--) if (headlineTextWidthPx(text, px) <= availPx) return px
  return minPx
}

// Supporting/detail line for the center-hook family: a FLAT 36px, against a 38px hook.
//
// 38/36 is DELIBERATE and not an accident of some ratio. This started as a 0.75 ratio (21px), then a
// flat 24px; both tested too small for lines like "Starting at $1,500/mo" on real mobile video.
// Legibility on a phone outranks a numeric size hierarchy here — the supporting line is already
// subordinate by placement (below the hook) and by content, so it does not need to be visibly smaller
// to read as secondary. Do not "restore proportion" by shrinking this.
//
// The clamp is a safety rail, not the rule. It is hook − 1 so the detail is always reachable at the
// ceiling (36 sits under the 38 hook with room to spare), while still guaranteeing the supporting
// line stays STRICTLY under the headline if a hook ever shrinks below the ceiling (only reachable by
// copy too long for the box even at 38px). Hero detail sizing (MARKET_TYPE_DETAIL_PX, OVERLAY_SPEC.sub.fontPx) is NOT affected.
const HOOK_DETAIL_PX = 36
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
  // T15/T16 what_mo_gets_you* are now the ONLY templates with no second line, and for a reason that
  // cannot be generalised away: they already state the price INSIDE the headline sentence ("What
  // $1,495/month gets you in Dallas"), so a price line below would print the same number twice.
  // Every other template with a hook takes the shared optional price line.
  // T18 carries NO detail line — it states its price inside the question — so it joins the
  // detail-free bucket rather than reserving a slot it never fills.
  //
  // T20 (client_me) MOVED OUT of this bucket. It is a two-statement exchange, and it used to carry
  // both statements in ONE headline separated by an authored "\n". That was the wrong shape: a
  // headline is one element, so the second statement had no independent position and its spacing
  // had to be faked with line-spacing tricks that the editor preview did not even honour. The
  // exchange is now exactly what it always was structurally — a headline and a second line below
  // it — which is the shape T19 already has. Same family, same geometry, same gap, no special case.
  if (template === "what_mo_gets_you" || template === "what_mo_gets_you_top"
    || template === "would_you_live_here") return "center_hook"
  // apartment_standards is an EXACT Upgrade variant → same center-hook+detail geometry. T12–T15 join
  // them: T11's centered composition plus an OPTIONAL "Starting at $X/mo" line that collapses to a
  // headline-only render when there is no valid price (hasDetail below is text-driven, not family-driven).
  // affordable_luxury (T9) MOVED here from center_hook. Its detail is now the shared optional price
  // line, and `hasDetail` in computeOverlayLayout is text-driven rather than family-driven — so with
  // no valid price T9 still renders exactly as it did before: headline only, no gap reserved. The
  // family change is what makes the line reachable at all; it does not force a line to exist.
  if (template === "upgrade" || template === "apartment_standards" || template === "pov_price"
    || template === "trade_up" || template === "wanted_luxury" || template === "real_living" || template === "hits_different"
    || template === "affordable_luxury" || template === "next_property" || template === "pov_upgrade"
    // T18-T20 join Template 8's family rather than getting branches of their own. Membership IS
    // the layout: centered placement, CENTER_HOOK sizing and fit, uppercase:false, the side
    // margins, line spacing, hookDetailPxFor and the shared 17px gap all arrive with it. No new
    // constants, no second code path, and the preview and the FFmpeg render stay identical for
    // free. T18 returns an empty detail, which the text-driven hasDetail collapses; T20 fills the
    // slot with the second half of its exchange, the same way T19 fills it with a price.
    // T19 takes Template 8's optional price line, so it joins this family exactly.
    // T20 (client_me) joins it too: its "Me: …" reply occupies the SAME slot, at the same size,
    // gap and alignment T19 gives "Starting at $X/month".
    || template === "imagine_coming_home" || template === "client_me"
    // T21 is T20's treatment with different wording: same family, so it inherits the identical
    // centred placement, CENTER_HOOK sizing and fit, side margins, hookDetailPxFor and the shared
    // 17px gap. Membership IS the design reference — nothing about T20 is copied, so the two cannot
    // drift apart and T20 itself is not touched.
    || template === "client_me_bad_credit"
    // T22, same reasoning as T21: membership IS the design reference. It inherits the identical
    // centred placement, CENTER_HOOK sizing and fit, side margins, hookDetailPxFor and the shared
    // 17px gap from this one list, so the three Client / Me templates cannot drift apart and
    // neither T20 nor T21 is touched to add it.
    || template === "client_me_ex_cheated"
    // T23 and T24 join on exactly the same terms — membership is the whole layout change.
    || template === "client_me_rent_increase" || template === "client_me_roaches"
    // property_tour (T17) is Template 3's treatment with tour wording. Joining this list is the
    // WHOLE layout change: centered placement, CENTER_HOOK sizing/fit, uppercase:false, side
    // margins, line spacing, the hookDetailPxFor price size and the shared 17px gap all come with
    // membership. No new constants and no new branch, so the preview and the FFmpeg render cannot
    // drift — both read this one function.
    // T25-T31 join on exactly the same terms. Membership IS the whole layout change: centered
    // placement, CENTER_HOOK sizing and fit, uppercase:false, the side margins, line spacing,
    // hookDetailPxFor and the shared 17px gap all arrive with it, so the editor preview and the
    // FFmpeg render read this one function and cannot drift.
    //
    // AURA (T30) is here because this is the family Template 7 uses — reusing its positioning was
    // the requirement, and membership is how that is expressed. Template 7 itself is untouched.
    //
    // THEM VS. ME (T28) is here for a different reason and it matters: this is the SAME family
    // Client / Me belongs to, so its two-statement exchange inherits Client / Me's exact layout,
    // sizing, gap, sequencing and reveal timing without copying any of it — and without touching
    // any Client / Me template to add it.
    || template === "apartment_crush" || template === "engagement" || template === "level_up"
    || template === "them_vs_me" || template === "view" || template === "aura"
    || template === "pov_couple"
    // T32 ROOMIE joins on the same terms: membership IS the layout, so its "2 bed apartment…" /
    // "Only $800/month per roomie" pair gets the identical centred placement, sizing, side
    // margins and 17px gap every other hook+detail template has.
    || template === "roomie"
    || template === "your_sign" || template === "property_tour") return "center_hook_detail"
  return "hero" // market_type, market_type_centered (vertically centered in the hero branch), special_feature, unknown → hero
}

// `face` says WHICH bundled font a block renders in, so the CSS preview and the FFmpeg render pick the
// same one. It is per-BLOCK, not per-element-role: the conversational detail renders in the HEAD face
// (Libre Baskerville Bold), as does the hero detail — one face everywhere. Anything measuring a
// block's width must use the matching advance map — head face -> headlineTextWidthPx.
/**
 * The overlay typeface. ONE member, deliberately.
 *
 * This was `"head" | "detail"`, where "detail" selected a Bodoni Moda text cut for the hero
 * secondary line. Bodoni is a Didone: its defining hairline strokes are the first thing a lossy
 * re-encode destroys, which is exactly how "2 Months Free · Private Yards" came to read as thin
 * and decorative beside its own headline.
 *
 * Narrowing the UNION rather than merely ceasing to emit "detail" is the point. While the second
 * member existed, every `face:` assignment and every `face === "head" ? … : …` branch was a place
 * Bodoni could silently return — and a wrong face is invisible in a thumbnail. Now reintroducing
 * it is a TYPE ERROR at the assignment, not a visual regression discovered in a published Reel.
 */
export type OverlayFace = "head"
// PER-LINE geometry (`linePx` + `lineTopPx`, always the same length as `lines`) is present ONLY for
// the compound two-line hero. When set, each line is drawn as its OWN unit — one FFmpeg drawtext and
// one absolutely-positioned preview div at that exact top — which is what lets the two lines carry
// different sizes and still land on identical baselines in both paths. When absent (every other
// headline and every detail) the block behaves exactly as before: one unit, one size, `lineSpacing`.
export type OverlayBlock = { lines: string[]; fontPx: number; topPx: number; uppercase: boolean; sideMarginPx: number; lineSpacing: number; face: OverlayFace; linePx?: number[]; lineTopPx?: number[] }
export type OverlayLayout = { family: LayoutFamily; headline: OverlayBlock; detail: OverlayBlock | null }

/** Resolve the on-canvas (1080×1920) layout for a template + its already-computed headline/detail
 *  text. Shared by the CSS preview and the FFmpeg render so the two match. */

// ── THE TOP ANCHOR IS NOW PER PLATFORM ──────────────────────────────────────────────────────────
// The three top-anchored templates — T1 market_type, T4 special_feature and T16
// what_mo_gets_you_top — share ONE vertical position, deliberately, so they read as a family on
// the profile grid. That shared position is what this resolves; it does not give any template an
// anchor of its own.
//
// INSTAGRAM IS FROZEN AT 427. Not approximately: the map below has no instagram entry, so
// Instagram falls through to exactly the expression it has always used
// (OVERLAY_SPEC.headline.yFrac * H = 427). There is no new arithmetic in Instagram's path, so it
// cannot drift by a rounding step. 427 was arrived at through a round of trial and error and is
// approved; nothing here may move it.
//
// TIKTOK IS 300, AND IT IS A TEST VALUE. Measured from two real published screenshots (the video
// frame maps to screenshot y 129.5–1766.5 at scale 0.8527, verified by predicting the burned-in
// headline's cap-top at 493.6 against a measured 495): TikTok's top chrome ends at canvas y 83 on
// a profile view, its rail starts at x 970, and an EXPANDED caption climbs to y 831. 300 clears
// all three with room, and keeps clear of a conservative 160 floor that allows for the For You
// feed's lower Following/For You tabs, which neither screenshot shows.
//
// It is explicitly NOT final. It is authorised for one supervised SELF_ONLY test so the placement
// can be judged on a phone against TikTok's real interface, which is the only way this gets
// settled — a desktop preview cannot answer it. Expect to change this one number.
const PLATFORM_TOP_ANCHOR_PX: Record<string, number> = {
  tiktok: 300,
}

/** The shared top-anchor y for the top-anchored family, for this platform. Instagram and anything
 *  unknown fall through to the historic yFrac expression, unchanged. */
function topAnchorPx(platform: string): number {
  return PLATFORM_TOP_ANCHOR_PX[(platform ?? "").toLowerCase()] ?? OVERLAY_SPEC.headline.yFrac * OVERLAY_CANVAS.h
}

export function computeOverlayLayout(template: string, headlineText: string, detailText: string, platform: string = DEFAULT_PLATFORM): OverlayLayout {
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
    // Only this size ceiling — the face is the same Libre Baskerville Bold as the headline.
    const baseDetailPx = usesMarketDetail
      ? Math.min(MARKET_TYPE_DETAIL_PX, Math.max(OVERLAY_SPEC.sub.fontPx, fit.fontPx - 2))
      : OVERLAY_SPEC.sub.fontPx
    // COMPOUND-ONLY: keep the supporting line visibly BELOW the compound property-type line. The rule
    // above floors at 44 (OVERLAY_SPEC.sub.fontPx), which at a 44px property line made the price
    // exactly as large as the title it supports. Scale off the property line instead — fit.fontPx IS
    // the property line for a compound title — and take the SMALLER of that and the normal result, so
    // this can only ever reduce the detail, never raise it (T4's flat 44 base still caps T4). Applies
    // to both branches above, so the Special Feature detail gets the same treatment as the price.
    const detailPx = fit.linePx
      ? Math.min(baseDetailPx, Math.max(COMPOUND_DETAIL_MIN_PX, Math.round(fit.fontPx * COMPOUND_DETAIL_SCALE)))
      : baseDetailPx
    const detailLines = hasDetail ? wrapSub(detail) : []
    const detailBlockH = hasDetail ? detailLines.length * detailPx + Math.max(0, detailLines.length - 1) * OVERLAY_SPEC.sub.lineSpacing : 0
    const gap = hasDetail ? heroGapPx : 0
    const totalH = headBlockH + gap + detailBlockH
    // Anchor: near-top (yFrac) for T1; vertical center of the group for the Centered variant.
    const headTop = centered ? (H - totalH) / 2 : topAnchorPx(platform)
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
      // HERO detail renders in the HEAD face (Libre Baskerville Bold 700), same as the headline above
      // it and the same as the conversational detail. It previously used the Bodoni Moda text cut
      // (wght 500) — a Didone, whose defining hairline strokes are the first thing Instagram's
      // re-encode destroys, which is exactly how a line like "2 Months Free · Private Yards" came to
      // read as thin and decorative next to its own headline.
      //
      // This finishes a migration that was already half-done: the conversational/center-hook detail
      // moved to the head face earlier and the hero family was deliberately left behind. With this
      // line, NO live layout emits face "detail" any more.
      //
      // Sizes, gaps, wrapping and placement are deliberately untouched. That is safe but not free:
      // Libre Baskerville runs ~14-16% wider than Bodoni, and hero detail has no fit-down step (the
      // wrap is character-count based, so it is font-agnostic). Measured against the 930px box:
      // "2 Months Free · Private Yards" @44px = 680px, "Starting at $1,800/month" @52px = 688px, a
      // full 33-character line @52px ≈ 876px. Real copy clears it; a 33-char line of wide capitals
      // would not — but that already overflowed in Bodoni (1733px), so the hazard predates this.
      detailBlock = { lines: detailLines, fontPx: detailPx, topPx: headTop + headBlockH + gap, uppercase: false, sideMarginPx: OVERLAY_SPEC.sub.sideMarginPx, lineSpacing: OVERLAY_SPEC.sub.lineSpacing, face: "head" }
    }
    return { family, headline, detail: detailBlock }
  }

  // ── HARD LINE BREAKS ────────────────────────────────────────────────────────────────────────
  // The hook is normally ONE line, fit-to-width per sentence. T20's Client/Me exchange is the
  // first headline that is genuinely TWO statements: the break is the joke's timing, and
  // collapsing it (as `replace(/\s+/g, " ")` did) ran the punchline onto the end of the setup.
  //
  // A headline WITHOUT "\n" takes the identical path it always did — `segments.length === 1`
  // leaves `oneLine` exactly as before — so all seventeen existing templates are untouched.
  const segments = (headlineText ?? "").split("\n").map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean)
  const hardLines = segments.length > 1 ? segments : null
  const oneLine = hardLines ? "" : (headlineText ?? "").replace(/\s+/g, " ").trim()
  // T5 (Next Property) used to take a smaller 40px max than the shared 46px cap for side-margin
  // breathing room. At a 28px ceiling that exception is obsolete (40 > 28 would make T5 the LARGEST
  // hook, inverting its intent), so every center-hook template now shares the one ceiling.
  const hookMaxPx = CENTER_HOOK.maxPx
  // One shared floor (34) now covers every hook. It also subsumes T14's old per-template 35px floor:
  // a LOWER floor can only make one line easier to achieve, so "This is what real rental home living
  // looks like" stays single-line a fortiori (asserted in the composer tests).
  const hookMinPx = HOOK_FLOOR_PX
  // FIT DOWN FIRST. A one-line headline renders at the LARGEST size in
  // [HOOK_ONE_LINE_MIN_PX, ceiling] that keeps it on one line in the conversational box — so sizes
  // vary per headline (38px short, 31px long) instead of one flat size forcing long copy to wrap.
  // fitHookPx returns its minPx untested when nothing fits, so the result is re-measured before it
  // is trusted as a genuine one-line fit.
  // The box is the PLATFORM's text-safe area, not the raw canvas — Instagram's measured 860px
  // here, TikTok's narrower box when rendering for TikTok. Each platform fits to its own; a wider
  // platform is never penalised by a narrower one's estimate.
  const safeW = textAvailPx(platform)
  const oneLinePx = oneLine ? fitHookPx(oneLine, hookMaxPx, HOOK_ONE_LINE_MIN_PX, safeW) : 0
  const fitsOneLine = !!oneLine && headlineTextWidthPx(oneLine, oneLinePx) <= safeW
  // Hard-broken copy keeps its own lines and is sized so the WIDEST of them fits the box — the
  // same per-line fit the wrap branch below performs, just with the breaks chosen by the author
  // instead of by the wrapper.
  let lines = hardLines ?? (oneLine ? [oneLine] : [])
  let hookPx = hardLines
    ? Math.min(...hardLines.map((l) => fitHookPx(l, hookMaxPx, hookMinPx, safeW)))
    : (fitsOneLine ? oneLinePx : hookMaxPx)
  // Copy too wide for the box AT THE CEILING WRAPS rather than shrinking below the conversational
  // scale. The trigger is deliberately the CEILING, not the floor: at the floor, T12's sentence does
  // fit one line (837px at 22px) — but only by rendering ~5px smaller than every other template, which
  // is exactly the "unnecessarily tiny" outcome the scale exists to avoid. Wrapping instead keeps T12
  // at the same 28px as its siblings. Only T12 reaches this branch; every other hook fits one line at
  // the ceiling. The per-line budget comes from the real measured width (no magic constant) and breaks
  // the sentence into as FEW lines as possible, so T12 is two lines, never three.
  if (oneLine && !fitsOneLine) {
    // BALANCED break. Packing each line to the box maximally left an orphan ("…for a" / "rental
    // home" — 877px then 92px). Take the fewest lines the width actually requires, then use the
    // SMALLEST character budget that still produces that many lines: an even split is the starting
    // guess, and the budget grows until the greedy wrapper stops over-splitting (an even split alone
    // pushed the short types to three lines). The result is the minimum line count with lines of
    // near-equal length.
    const needed = Math.max(2, Math.ceil(headlineTextWidthPx(oneLine, HOOK_ONE_LINE_MIN_PX) / safeW))
    let perLine = Math.max(8, Math.ceil(oneLine.length / needed))
    lines = wrapHeadline(oneLine, perLine)
    while (lines.length > needed && perLine < oneLine.length) {
      perLine++
      lines = wrapHeadline(oneLine, perLine)
    }
    hookPx = Math.min(...lines.map((l) => fitHookPx(l, hookMaxPx, hookMinPx, safeW)))
  }
  const n = Math.max(1, lines.length)
  // Wrapped continuation spacing. T20 used to need a special case here — it carried two statements
  // in one headline separated by an authored "\n" — but it now puts its second statement in the
  // DETAIL slot like T19, so there is nothing left to special-case and the workaround is gone.
  //
  // hardLines itself stays: a hand-edited headline may still contain a newline, and honouring it is
  // older than T20 and not specific to it. Such a headline simply uses the normal line spacing.
  const headBlockH = n * hookPx + (n - 1) * CENTER_HOOK.lineSpacing
  const hasDetail = family === "center_hook_detail" && detail.length > 0
  // Detail is ONE line, FIT-TO-WIDTH at a larger price-detail size that stays below
  // the hook (see hookDetailPxFor) so it reads as a strong-but-secondary line. Shrinks only if
  // an unusually long detail needs it; never wraps/stacks.
  // Measured with HEADLINE metrics because it now RENDERS in the head face — using the Bodoni advance
  // map here would under-measure it by ~13% and break preview/render parity. Size and box are unchanged.
  const detailPx = hasDetail ? fitHookPx(detail, hookDetailPxFor(hookPx), HOOK_DETAIL_MIN_PX, safeW) : CENTER_HOOK.detailFontPx
  const detailLines = hasDetail ? [detail] : []
  const detailBlockH = hasDetail ? detailPx : 0 // one line
  // ONE gap for every conversational template, derived from the ACTUAL rendered hook size (which
  // varies per sentence, and is smaller again when T12 wraps) — so the separation the eye sees is
  // the same everywhere. No per-template branch: that branch is what let T10–T14 drift 29% tighter
  // than T7. `hasDetail` is text-driven, so a template with no price line reserves NO gap at all.
  const gap = hasDetail ? detailGapPx() : 0
  const totalH = headBlockH + gap + detailBlockH
  // T16 (what_mo_gets_you_top) is T11 anchored near the TOP instead of vertically centered — the
  // mirror image of T2, which is T1's typography at a centered anchor. Only the anchor differs, and it
  // reuses T1's own yFrac constant, so the hook typography/fit stays identical to T11's.
  const topAnchored = template === "what_mo_gets_you_top"
  const groupTop = topAnchored ? topAnchorPx(platform) : (H - totalH) / 2
  const headline: OverlayBlock = { lines, fontPx: hookPx, topPx: groupTop, uppercase: false, sideMarginPx: sideMarginPx(platform), lineSpacing: CENTER_HOOK.lineSpacing, face: "head" }
  const detailBlock: OverlayBlock | null = hasDetail
    ? { lines: detailLines, fontPx: detailPx, topPx: groupTop + headBlockH + gap, uppercase: false, sideMarginPx: sideMarginPx(platform), lineSpacing: OVERLAY_SPEC.sub.lineSpacing, face: "head" }
    : null
  return { family, headline, detail: detailBlock }
}

// REMOVED: overlayPreviewStyle(). It was the pre-template editing-preview helper, and by the end only
// BulkReview still used it — hand-rolling its own overlay from wrapHeadline() + a FIXED 66px size,
// which bypassed fit-to-width and rendered long headlines as stacked ≤16-char lines while the burn-in
// drew one fitted line. Every overlay surface now goes through computeOverlayLayout + <PreviewOverlay>,
// so there is exactly ONE geometry path and a preview cannot drift from the render. Do not reintroduce
// a second px→% helper; add to computeOverlayLayout instead.
