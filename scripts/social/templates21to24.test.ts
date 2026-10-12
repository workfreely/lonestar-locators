// TEMPLATES 21 and 22 — the two Client / Me variations that joined Template 20's family, and T21's
// city-aware caption.
//
// Both are Template 20's treatment with different wording: they carry NO geometry of their own.
// They join `center_hook_detail` in overlaySpec and that membership IS the design — centred
// placement, CENTER_HOOK sizing and fit, side margins, hookDetailPxFor and the shared 17px gap all
// arrive with it. So the assertions below do not re-state T20's numbers; they assert that all three
// templates produce the SAME family, side margin, gap and block centre, which is the thing that
// would actually break if one of them ever grew a special case.
//
// Two rules are easy to get wrong and are asserted directly:
//
//   CAPTION-ONLY   T21's "Applications approved on a case-by-case basis" and T22's whole caption are
//                  caption copy. None of it may reach a burned-in overlay, where it would be
//                  unreadable at this size and would follow the footage into every re-use.
//   NO FABRICATION T22 names only the SEVEN simple canonical nouns; anything else — a Social-only
//                  compound type, a non-canonical value, or no type at all — falls back to
//                  "apartment". T21 degrades to its cityless opening line with no market.
//
// Run: npx tsx scripts/social/templates21to22.test.ts
import { OVERLAY_TEMPLATES, OVERLAY_TEMPLATE_LABEL, buildTemplateHeadline, buildTemplateDetail, buildCaption, isGeneratedCaption, isGeneratedHeadline, BAD_CREDIT_CAPTION, EX_CHEATED_CAPTION } from "../../lib/social/composePost"
import { computeOverlayLayout, templateFamily } from "../../lib/social/overlaySpec"
import { buildDrawPlan } from "../../lib/social/renderVideo"
import { PROPERTY_TYPES, SOCIAL_CANONICAL_ORDER, propertyNoun } from "../../lib/social/propertyTypes"
import { SOCIAL_MARKETS } from "../../lib/social/markets"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const meta = (o: Record<string, unknown> = {}) => ({ market: null, propertyType: null, budgetRange: null, amenities: null, special: null, socialSpecial: null, priceLabelMode: null, ...o }) as never
const T21 = "client_me_bad_credit" as never
const T22 = "client_me_ex_cheated" as never

// ── 1. REGISTRY ─────────────────────────────────────────────────────────────
console.log("1. registry — appended last, so no saved post's stored template string moves:")
ok("T21 sits at index 20", OVERLAY_TEMPLATES[20] === "client_me_bad_credit")
ok("T22 sits at index 21 (dropdown position 22)", OVERLAY_TEMPLATES[21] === "client_me_ex_cheated")
ok("T22 is LAST, so every earlier index is untouched", OVERLAY_TEMPLATES[OVERLAY_TEMPLATES.length - 1] === "client_me_ex_cheated")
ok("both have dropdown labels", OVERLAY_TEMPLATE_LABEL[T21] === "Client / Me — Bad Credit" && OVERLAY_TEMPLATE_LABEL[T22] === "Client / Me — My Ex Cheated")
ok("no key is duplicated", new Set(OVERLAY_TEMPLATES).size === OVERLAY_TEMPLATES.length)

// ── 2. ONE FAMILY, NO SPECIAL CASES ─────────────────────────────────────────
console.log("\n2. all three Client / Me templates share T20's layout, with no numbers restated here:")
const SIBLINGS = ["client_me", "client_me_bad_credit", "client_me_ex_cheated"] as const
ok("all three report the same family", SIBLINGS.every((t) => templateFamily(t as never) === templateFamily("client_me" as never)))
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
ok("the reply line is ONE definition shared by all three",
  new Set(SIBLINGS.map((t) => buildTemplateDetail(t as never, meta({ market: "Dallas", propertyType: "Loft" })))).size === 1)
ok("...and it is the approved wording", buildTemplateDetail(T22, meta()) === "Me: “Say less.”")

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
    && b.includes("✅ Comment LIST and I'll help you find options that fit your budget and situation.")
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
console.log("\n5. T22 caption: fixed approved copy:")
ok("it is the approved block, returned whole", buildCaption(meta({ market: "Dallas", propertyType: "Loft" }), "seed", T22) === EX_CHEATED_CAPTION)
ok("the approved copy is intact, in order",
  EX_CHEATED_CAPTION.split("\n\n").join("|") === [
    "My ex cheated. I need a new apartment. 😭",
    "Some apartment communities offer flexible options depending on your situation.",
    "My apartment locating service is completely FREE!",
    "✅ Comment LIST and I'll help you find options that fit your budget and situation.",
  ].join("|"))
ok("the closing CTA line is byte-identical to T21's, so the siblings read as one voice",
  EX_CHEATED_CAPTION.includes("✅ Comment LIST and I'll help you find options that fit your budget and situation.")
  && BAD_CREDIT_CAPTION.includes("✅ Comment LIST and I'll help you find options that fit your budget and situation."))
{
  const n: string[] = []
  for (const m of [...SOCIAL_MARKETS, null]) for (const pt of [...PROPERTY_TYPES, null]) for (const sp of ["8 Weeks Free", null]) for (const sd of ["a", 7]) {
    n.push(buildCaption(meta({ market: m, propertyType: pt, socialSpecial: sp, amenities: "Pool", budgetRange: "1800" }), sd as never, T22))
  }
  ok(`fixed across all ${n.length} metadata combinations`, new Set(n).size === 1)
  ok("...and carries no ✨ special line and no 🏡 amenities section", !n[0].includes("✨") && !n[0].includes("🏡"))
}

// ── 6. CAPTION COPY NEVER REACHES AN OVERLAY ────────────────────────────────
console.log("\n6. caption-only copy stays out of every burned-in overlay:")
{
  const CAPTION_ONLY = /😭|completely FREE|flexible credit requirements|flexible options depending|Comment LIST|case-by-case|Moving to .* with Bad credit|\bUp to\b/i
  let leaks = 0, checked = 0
  for (const t of OVERLAY_TEMPLATES) for (const m of [...SOCIAL_MARKETS, null]) for (const pt of [...PROPERTY_TYPES, null]) for (const sp of ["8 Weeks Free", "2 Months Free", "$500 Gift Card", null]) {
    const s = meta({ market: m, propertyType: pt, socialSpecial: sp, budgetRange: "1800", amenities: "Pool" })
    checked++
    if (CAPTION_ONLY.test(`${buildTemplateHeadline(t as never, s)} ${buildTemplateDetail(t as never, s)}`)) leaks++
  }
  ok(`${checked} overlay texts across all ${OVERLAY_TEMPLATES.length} templates carry no caption-only copy`, leaks === 0)
  ok("T21/T22 overlays are only the exchange itself",
    buildTemplateHeadline(T21, meta({ market: "Dallas" })) === "Client: “I have bad credit. Can you help me?”"
    && buildTemplateHeadline(T22, meta({ market: "Dallas", propertyType: "Loft" })) === "Client: “My ex cheated. I need a new loft.”")
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
ok("T22's caption is generator-owned", isGeneratedCaption(EX_CHEATED_CAPTION, meta({ market: "Dallas", propertyType: "Loft" }), "seed"))
ok("a hand-edited T22 caption is NOT generator-owned", !isGeneratedCaption(`${EX_CHEATED_CAPTION}\n\nDM me instead.`, meta({ market: "Dallas" }), "seed"))
ok("every T22 headline is generator-owned, so it re-syncs on a Property Type change",
  [...PROPERTY_TYPES, null].every((pt) => isGeneratedHeadline(buildTemplateHeadline(T22, meta({ propertyType: pt })), meta({ propertyType: pt }))))
ok("a hand-typed T22-style headline is still manual", !isGeneratedHeadline("Client: “My ex cheated. I need a new mansion.”", meta()))

console.log(`\nTemplates 21-22: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
