// TEMPLATES 21-24 — the four Client / Me variations that joined Template 20's family, their fixed
// captions, and T21's city-aware opening line.
//
// All four are Template 20's treatment with different wording: they carry NO geometry of their own.
// They join `center_hook_detail` in overlaySpec and that membership IS the design — centred
// placement, CENTER_HOOK sizing and fit, side margins, hookDetailPxFor and the shared 17px gap all
// arrive with it. So the assertions below do not re-state T20's numbers; they assert that all five
// templates produce the SAME family, side margin, gap and block centre, which is the thing that
// would actually break if one of them ever grew a special case.
//
// THE CTA IS NOT SPELLED OUT HERE EITHER. All four captions close with commentCta's sentence, the
// keyword pinned to LIST, so this suite asserts they equal commentCta(null) rather than carrying a
// fifth copy of a sentence that would then have to be kept in step with the other four.
//
// Two rules are easy to get wrong and are asserted directly:
//
//   CAPTION-ONLY   T21's "Applications approved on a case-by-case basis" and the whole of T22-T24's
//                  captions are caption copy. None of it may reach a burned-in overlay, where it
//                  would be unreadable at this size and would follow the footage into every re-use.
//   NO FABRICATION T22 names only the SEVEN simple canonical nouns; anything else — a Social-only
//                  compound type, a non-canonical value, or no type at all — falls back to
//                  "apartment". T21 degrades to its cityless opening line with no market.
//
// Run: npx tsx scripts/social/templates21to24.test.ts
import { OVERLAY_TEMPLATES, OVERLAY_TEMPLATE_LABEL, buildTemplateHeadline, buildTemplateDetail, buildCaption, commentCta, isGeneratedCaption, isGeneratedHeadline, BAD_CREDIT_CAPTION, EX_CHEATED_CAPTION, RENT_INCREASE_CAPTION, ROACHES_CAPTION } from "../../lib/social/composePost"
import { computeOverlayLayout, templateFamily } from "../../lib/social/overlaySpec"
import { buildDrawPlan } from "../../lib/social/renderVideo"
import { PROPERTY_TYPES, SOCIAL_CANONICAL_ORDER, propertyNoun } from "../../lib/social/propertyTypes"
import { SOCIAL_MARKETS } from "../../lib/social/markets"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const meta = (o: Record<string, unknown> = {}) => ({ market: null, propertyType: null, budgetRange: null, amenities: null, special: null, socialSpecial: null, priceLabelMode: null, ...o }) as never
const T21 = "client_me_bad_credit" as never
const T22 = "client_me_ex_cheated" as never
const T23 = "client_me_rent_increase" as never
const T24 = "client_me_roaches" as never
const CTA = commentCta(null)   // the one CTA sentence, keyword pinned to LIST

// ── 1. REGISTRY ─────────────────────────────────────────────────────────────
console.log("1. registry — appended last, so no saved post's stored template string moves:")
ok("T21 sits at index 20", OVERLAY_TEMPLATES[20] === "client_me_bad_credit")
ok("T22 sits at index 21 (dropdown position 22)", OVERLAY_TEMPLATES[21] === "client_me_ex_cheated")
ok("T23 sits at index 22 (dropdown position 23)", OVERLAY_TEMPLATES[22] === "client_me_rent_increase")
ok("T24 sits at index 23 (dropdown position 24)", OVERLAY_TEMPLATES[23] === "client_me_roaches")
// WAS "T24 is LAST". Its intent was "nothing was inserted BEFORE the existing templates", which
// is still exactly true — T25-T31 were appended after it. T24 is now the last of the ORIGINAL 24,
// which is the invariant worth holding; being last overall never was.
ok("T24 still closes the original 24, so every earlier index is untouched", OVERLAY_TEMPLATES[23] === "client_me_roaches")
ok("all four have dropdown labels",
  OVERLAY_TEMPLATE_LABEL[T21] === "Client / Me — Bad Credit" && OVERLAY_TEMPLATE_LABEL[T22] === "Client / Me — My Ex Cheated"
  && OVERLAY_TEMPLATE_LABEL[T23] === "Client / Me — Rent Increase" && OVERLAY_TEMPLATE_LABEL[T24] === "Client / Me — Roaches")
ok("no key is duplicated", new Set(OVERLAY_TEMPLATES).size === OVERLAY_TEMPLATES.length)

// ── 2. ONE FAMILY, NO SPECIAL CASES ─────────────────────────────────────────
console.log("\n2. all five Client / Me templates share T20's layout, with no numbers restated here:")
const SIBLINGS = ["client_me", "client_me_bad_credit", "client_me_ex_cheated", "client_me_rent_increase", "client_me_roaches"] as const
ok("all five report the same family", SIBLINGS.every((t) => templateFamily(t as never) === templateFamily("client_me" as never)))
ok("...and that family is center_hook_detail", templateFamily("client_me" as never) === "center_hook_detail")
{
  const rows = SIBLINGS.flatMap((t) => (t === "client_me_ex_cheated" ? [...PROPERTY_TYPES, null] : [null]).map((pt) => {
    const s = meta({ market: "Dallas", propertyType: pt })
    const L = computeOverlayLayout(t as never, buildTemplateHeadline(t as never, s), buildTemplateDetail(t as never, s))
    return { t, pt, L }
  }))
  ok("every one renders headline + detail as TWO elements (never one block with a newline)",
    rows.every(({ L }) => L.detail !== null && L.headline.lines.length === 1 && L.detail!.lines.length === 1
      && !L.headline.lines[0].includes("\n") && !L.headline.linePx))
  const gaps = new Set(rows.map(({ L }) => L.detail!.topPx - (L.headline.topPx + L.headline.fontPx)))
  ok(`one shared gap across all ${rows.length} cases (${[...gaps].join(", ")}px)`, gaps.size === 1)
  const margins = new Set(rows.flatMap(({ L }) => [L.headline.sideMarginPx, L.detail!.sideMarginPx]))
  ok(`one shared side margin (${[...margins].join(", ")}px)`, margins.size === 1)
  const centres = new Set(rows.map(({ L }) => (L.headline.topPx + L.detail!.topPx + L.detail!.fontPx) / 2))
  ok(`every block is centred identically (${[...centres].join(", ")}px)`, centres.size === 1)
  ok("the detail is always smaller than the headline, never larger", rows.every(({ L }) => L.detail!.fontPx <= L.headline.fontPx))
  ok("the FFmpeg draw plan is the same two rows for all of them",
    rows.every(({ L }) => buildDrawPlan(L).map((r) => r.name).join("+") === "head+sub"))
}
// T21 is the ONE Client / Me template whose reply differs: "I got you." answers a question about the
// renter's situation where the others answer a request. Only the WORDS differ — same slot, same
// family, same gap, which the shared-geometry assertions above already pinned.
ok("T21 replies “I got you.”", buildTemplateDetail(T21, meta({ market: "Dallas" })) === "Me: “I got you.”")
ok("T20, T22, T23 and T24 all reply “Say less.”, from ONE shared definition",
  new Set(["client_me", "client_me_ex_cheated", "client_me_rent_increase", "client_me_roaches"]
    .map((t) => buildTemplateDetail(t as never, meta({ market: "Dallas", propertyType: "Loft" })))).size === 1
  && buildTemplateDetail(T24, meta()) === "Me: “Say less.”")
ok("T21's reply does not leak into its siblings",
  ["client_me", "client_me_ex_cheated", "client_me_rent_increase", "client_me_roaches"]
    .every((t) => buildTemplateDetail(t as never, meta()) !== "Me: “I got you.”"))

// ── 3. T22 HEADLINE — SEVEN NOUNS, ONE FALLBACK ─────────────────────────────
console.log("\n3. T22 headline: only the seven simple nouns, everything else → apartment:")
const ALLOWED = SOCIAL_CANONICAL_ORDER.map((t) => propertyNoun(t))
ok("the approved noun list is exactly the seven canonical types",
  ALLOWED.join("|") === "studio|apartment|high-rise|townhome|rental home|penthouse|loft")
for (const t of SOCIAL_CANONICAL_ORDER) {
  const want = `Client: “My ex cheated. I need a new ${propertyNoun(t)}.”`
  ok(`${t} → ${JSON.stringify(want)}`, buildTemplateHeadline(T22, meta({ propertyType: t })) === want)
}
const FALLBACK = "Client: “My ex cheated. I need a new apartment.”"
for (const pt of [...PROPERTY_TYPES.filter((t) => !(SOCIAL_CANONICAL_ORDER as readonly string[]).includes(t)), "Open to All", "Duplex", "high rise", "", null]) {
  ok(`${JSON.stringify(pt)} falls back to "a new apartment"`, buildTemplateHeadline(T22, meta({ propertyType: pt })) === FALLBACK)
}
ok("no compound qualifier ever reaches the headline",
  PROPERTY_TYPES.every((pt) => !/split-level|industrial-style/i.test(buildTemplateHeadline(T22, meta({ propertyType: pt })))))
ok("the market NEVER appears — this template names no city",
  [...SOCIAL_MARKETS, null].every((m) => PROPERTY_TYPES.every((pt) => buildTemplateHeadline(T22, meta({ market: m, propertyType: pt })) === buildTemplateHeadline(T22, meta({ propertyType: pt })))))
ok("the sentence stays short: one line, never wrapped, for every allowed noun",
  SOCIAL_CANONICAL_ORDER.every((pt) => {
    const s = meta({ propertyType: pt })
    const L = computeOverlayLayout(T22, buildTemplateHeadline(T22, s), buildTemplateDetail(T22, s))
    return L.headline.lines.length === 1
  }))

// ── 3b. T23 / T24 HEADLINES ─────────────────────────────────────────────────
console.log("\n3b. T23 and T24 headlines: fixed copy, approved emphasis:")
ok("T23 headline", buildTemplateHeadline(T23, meta({ market: "Dallas", propertyType: "Loft" })) === "Client: “My rent went up AGAIN. I need to move.”")
ok("T24 headline", buildTemplateHeadline(T24, meta({ market: "Dallas", propertyType: "Loft" })) === "Client: “My apartment has ROACHES. I need OUT!”")
ok("neither varies by market or property type — they describe a situation, not a property",
  [...SOCIAL_MARKETS, null].every((m) => [...PROPERTY_TYPES, null].every((pt) =>
    buildTemplateHeadline(T23, meta({ market: m, propertyType: pt })) === buildTemplateHeadline(T23, meta())
    && buildTemplateHeadline(T24, meta({ market: m, propertyType: pt })) === buildTemplateHeadline(T24, meta()))))
ok("both still fit on ONE line at the family's own sizing", [T23, T24].every((t) => {
  const L = computeOverlayLayout(t, buildTemplateHeadline(t, meta()), buildTemplateDetail(t, meta()))
  return L.headline.lines.length === 1 && L.detail!.lines.length === 1
}))

// ── 4. T21 CAPTION — THE CITY IS THE ONE VARIABLE ───────────────────────────
console.log("\n4. T21 caption: the city is inserted, the rest is fixed:")
for (const m of SOCIAL_MARKETS) {
  const c = buildCaption(meta({ market: m }), "seed", T21)
  ok(`${m} → "Moving to ${m} with Bad credit? 😭"`, c.split("\n")[0] === `Moving to ${m} with Bad credit? 😭`)
}
ok("no market → the cityless opening line (never 'Moving to  with')",
  buildCaption(meta(), "seed", T21).split("\n")[0] === "Bad credit? 😭"
  && !buildCaption(meta(), "seed", T21).includes("Moving to"))
ok("a blank market degrades the same way", buildCaption(meta({ market: "   " }), "seed", T21).split("\n")[0] === "Bad credit? 😭")
{
  const body = (s: string) => s.split("\n").slice(1).join("\n")
  const bodies = new Set([...SOCIAL_MARKETS, null, "  "].map((m) => body(buildCaption(meta({ market: m }), "seed", T21))))
  ok("everything below the opening line is identical for every market", bodies.size === 1)
  const b = [...bodies][0]
  ok("the fixed body is the approved copy, in order",
    b.includes("Some apartment communities offer flexible credit requirements.")
    && b.includes("My apartment locating service is completely FREE!")
    && b.includes(CTA)
    && b.trimEnd().endsWith("Applications approved on a case-by-case basis."))
}
ok("the cityless form is exactly BAD_CREDIT_CAPTION", buildCaption(meta(), "seed", T21) === BAD_CREDIT_CAPTION)
{
  // Everything EXCEPT the market is ignored: no special line, no amenities, no price, no seed drift.
  const n: string[] = []
  for (const pt of [...PROPERTY_TYPES, null]) for (const sp of ["8 Weeks Free", "$500 Gift Card", null]) for (const am of ["Pool, Gym", null]) for (const sd of ["a", 7]) {
    n.push(buildCaption(meta({ market: "Houston", propertyType: pt, socialSpecial: sp, amenities: am, budgetRange: "1800" }), sd as never, T21))
  }
  ok(`fixed across ${n.length} non-market metadata combinations`, new Set(n).size === 1)
  ok("...and carries no ✨ special line and no 🏡 amenities section", !n[0].includes("✨") && !n[0].includes("🏡"))
}

// ── 5. T22 CAPTION ──────────────────────────────────────────────────────────
console.log("\n5. T22, T23 and T24 captions: fixed approved copy:")
const APPROVED: [never, string, string[]][] = [
  [T22, EX_CHEATED_CAPTION, [
    "My ex cheated. I need a new apartment. 😭",
    "Some apartment communities offer flexible options depending on your situation.",
    "My apartment locating service is completely FREE!",
    CTA,
  ]],
  [T23, RENT_INCREASE_CAPTION, [
    "Rent went up AGAIN? 😩",
    "Some apartment communities may offer better pricing, specials, or a better overall fit for your budget.",
    "My apartment locating service is completely FREE!",
    CTA,
  ]],
  [T24, ROACHES_CAPTION, [
    "Unwanted roommates? 😭 I got you!",
    "If your current place isn't working out, I can help you explore other apartment options within your budget.",
    "My apartment locating service is completely FREE!",
    CTA,
  ]],
]
for (const [tpl, exported, lines] of APPROVED) {
  ok(`${tpl}: the approved block, returned whole`, buildCaption(meta({ market: "Dallas", propertyType: "Loft" }), "seed", tpl) === exported)
  ok(`${tpl}: the approved copy is intact, in order`, exported.split("\n\n").join("|") === lines.join("|"))
  const n: string[] = []
  for (const m of [...SOCIAL_MARKETS, null]) for (const pt of [...PROPERTY_TYPES, null]) for (const sp of ["8 Weeks Free", null]) for (const sd of ["a", 7]) {
    n.push(buildCaption(meta({ market: m, propertyType: pt, socialSpecial: sp, amenities: "Pool", budgetRange: "1800" }), sd as never, tpl))
  }
  ok(`${tpl}: fixed across all ${n.length} metadata combinations`, new Set(n).size === 1)
  ok(`${tpl}: carries no ✨ special line and no 🏡 amenities section`, !n[0].includes("✨") && !n[0].includes("🏡"))
}

// ── 5b. THE ONE SHARED CTA ──────────────────────────────────────────────────
console.log("\n5b. all four close with the one CTA sentence, keyword pinned to LIST:")
ok(`it is commentCta's own sentence: ${JSON.stringify(CTA)}`, CTA === `✅ Comment "LIST" and I\u2019ll send you the best options within your budget.`)
for (const [tpl, exported] of APPROVED.map(([a, b]) => [a, b] as const).concat([[T21, BAD_CREDIT_CAPTION] as const])) {
  ok(`${tpl} closes with it`, exported.split("\n\n").includes(CTA))
  ok(`${tpl} no longer carries the superseded CTA`, !exported.includes("help you find options that fit your budget and situation"))
}
ok("the keyword is LIST for every property type — these four never vary it",
  [T21, T22, T23, T24].every((t) => [...PROPERTY_TYPES, null].every((pt) =>
    buildCaption(meta({ market: "Dallas", propertyType: pt }), "seed", t).includes(CTA))))
ok("'Pricing and availability change daily.' is in none of them",
  [BAD_CREDIT_CAPTION, EX_CHEATED_CAPTION, RENT_INCREASE_CAPTION, ROACHES_CAPTION].every((c) => !/Pricing and availability/i.test(c)))

// ── 6. CAPTION COPY NEVER REACHES AN OVERLAY ────────────────────────────────
console.log("\n6. caption-only copy stays out of every burned-in overlay:")
{
  const CAPTION_ONLY = /😭|😩|completely FREE|flexible credit requirements|flexible options depending|better pricing, specials|Unwanted roommates|Comment "?LIST|case-by-case|Moving to .* with Bad credit|isn't working out|\bUp to\b/i
  let leaks = 0, checked = 0
  for (const t of OVERLAY_TEMPLATES) for (const m of [...SOCIAL_MARKETS, null]) for (const pt of [...PROPERTY_TYPES, null]) for (const sp of ["8 Weeks Free", "2 Months Free", "$500 Gift Card", null]) {
    const s = meta({ market: m, propertyType: pt, socialSpecial: sp, budgetRange: "1800", amenities: "Pool" })
    checked++
    if (CAPTION_ONLY.test(`${buildTemplateHeadline(t as never, s)} ${buildTemplateDetail(t as never, s)}`)) leaks++
  }
  ok(`${checked} overlay texts across all ${OVERLAY_TEMPLATES.length} templates carry no caption-only copy`, leaks === 0)
  ok("T21-T24 overlays are only the exchange itself",
    buildTemplateHeadline(T21, meta({ market: "Dallas" })) === "Client: “I have bad credit. Can you help me?”"
    && buildTemplateHeadline(T22, meta({ market: "Dallas", propertyType: "Loft" })) === "Client: “My ex cheated. I need a new loft.”"
    && buildTemplateHeadline(T23, meta({ market: "Dallas" })) === "Client: “My rent went up AGAIN. I need to move.”"
    && buildTemplateHeadline(T24, meta({ market: "Dallas" })) === "Client: “My apartment has ROACHES. I need OUT!”")
}

// ── 7. GENERATED-STATE RECOGNITION ──────────────────────────────────────────
console.log("\n7. generated captions re-sync; manual edits are preserved:")
for (const m of [...SOCIAL_MARKETS, null]) {
  const s = meta({ market: m })
  ok(`T21 caption (${m ?? "no market"}) is generator-owned`, isGeneratedCaption(buildCaption(s, "seed", T21), s, "seed"))
}
ok("T21's SUPERSEDED cityless caption is STILL generator-owned on a post that now has a market",
  isGeneratedCaption(BAD_CREDIT_CAPTION, meta({ market: "Dallas" }), "seed"))
ok("...and so is another market's city line (stale after a Market change, not manual)",
  isGeneratedCaption(buildCaption(meta({ market: "Austin" }), "seed", T21), meta({ market: "Dallas" }), "seed"))
ok("a hand-edited T21 caption is NOT generator-owned", !isGeneratedCaption(`${BAD_CREDIT_CAPTION}\n\nDM me instead.`, meta({ market: "Dallas" }), "seed"))
for (const [name, cap] of [["T22", EX_CHEATED_CAPTION], ["T23", RENT_INCREASE_CAPTION], ["T24", ROACHES_CAPTION]] as const) {
  ok(`${name}'s caption is generator-owned`, isGeneratedCaption(cap, meta({ market: "Dallas", propertyType: "Loft" }), "seed"))
  ok(`a hand-edited ${name} caption is NOT generator-owned`, !isGeneratedCaption(`${cap}\n\nDM me instead.`, meta({ market: "Dallas" }), "seed"))
}
// The SUPERSEDED CTA. A caption written while the old wording was live must stay generator-owned, or
// an existing draft freezes as a "manual override" and never re-syncs on a Market/Type change —
// exactly what the legacy "/mo" and "Submit the form" entries in composePost exist to prevent.
{
  const OLD_CTA = "✅ Comment LIST and I'll help you find options that fit your budget and situation."
  for (const [name, cap, src] of [
    ["T21", BAD_CREDIT_CAPTION, meta({ market: "Dallas" })],
    ["T22", EX_CHEATED_CAPTION, meta({ market: "Dallas" })],
    ["T23", RENT_INCREASE_CAPTION, meta({ market: "Dallas" })],
    ["T24", ROACHES_CAPTION, meta({ market: "Dallas" })],
  ] as const) {
    const old = cap.replace(CTA, OLD_CTA)
    ok(`${name}: a caption written with the OLD CTA is still generator-owned`, old !== cap && isGeneratedCaption(old, src, "seed"))
    ok(`${name}: ...but a hand edit on top of it is still manual`, !isGeneratedCaption(`${old}\n\nDM me instead.`, src, "seed"))
  }
  ok("T21's superseded CITY line survives the CTA change too",
    isGeneratedCaption(BAD_CREDIT_CAPTION.replace(CTA, OLD_CTA).replace("Bad credit? 😭", "Moving to Austin with Bad credit? 😭"), meta({ market: "Dallas" }), "seed"))
}
ok("every T22 headline is generator-owned, so it re-syncs on a Property Type change",
  [...PROPERTY_TYPES, null].every((pt) => isGeneratedHeadline(buildTemplateHeadline(T22, meta({ propertyType: pt })), meta({ propertyType: pt }))))
ok("T23 and T24 headlines are generator-owned",
  isGeneratedHeadline(buildTemplateHeadline(T23, meta()), meta()) && isGeneratedHeadline(buildTemplateHeadline(T24, meta()), meta()))
ok("a hand-typed T22-style headline is still manual", !isGeneratedHeadline("Client: “My ex cheated. I need a new mansion.”", meta()))
ok("a hand-typed T23/T24-style headline is still manual",
  !isGeneratedHeadline("Client: “My rent doubled. I need to move.”", meta()) && !isGeneratedHeadline("Client: “My apartment has MICE. I need OUT!”", meta()))

console.log(`\nTemplates 21-24: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
