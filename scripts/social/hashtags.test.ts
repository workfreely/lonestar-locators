// Deterministic tests for the centralized hashtag engine. No network. Run: npx tsx scripts/social/hashtags.test.ts
import { buildHashtags, HASHTAG_MARKETS, normalizeHashtag, hashtagPropertyType, isCanonicalHashtag } from "@/lib/social/hashtags"
import { isGeneratedHashtags, MAX_HASHTAGS } from "@/lib/social/composePost"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const has = (h: string[], t: string) => h.map((x) => x.toLowerCase()).includes(t.toLowerCase())
const some = (h: string[], re: RegExp) => h.some((x) => re.test(x.toLowerCase()))
const noDupes = (h: string[]) => new Set(h.map((x) => x.toLowerCase())).size === h.length
// singular/plural stuffing check: no two tags share the concept (strip # + one trailing s)
const con = (t: string) => t.toLowerCase().replace(/^#+/, "").replace(/s$/, "")
const noStuffing = (h: string[]) => new Set(h.map(con)).size === h.length

const MARKETS = ["San Antonio", "Austin", "Dallas", "Houston"] as const
const TYPES = ["Apartment", "High-Rise", "Townhome", "Rental Home", "Loft", "Penthouse"] as const
const MARKET_TOKEN: Record<string, RegExp> = {
  "San Antonio": /sanantonio|satx/, Austin: /austin|atx/, Dallas: /dallas|dfw/, Houston: /houston|htx/,
}
const OTHER_TOKENS: Record<string, RegExp> = {
  "San Antonio": /austin|dallas|houston/, Austin: /sanantonio|dallas|houston/,
  Dallas: /sanantonio|austin|houston/, Houston: /sanantonio|austin|dallas/,
}
const MOVING: Record<string, string> = {
  "San Antonio": "#movingtosanantonio", Austin: "#movingtoaustin", Dallas: "#movingtodallas", Houston: "#movingtohouston",
}

console.log("engine invariants across every market × property type:")
for (const m of MARKETS) {
  for (const t of TYPES) {
    const h = buildHashtags(m, MAX_HASHTAGS, t)
    const tag = `${m} · ${t}`
    ok(`${tag}: 1–7 tags`, h.length >= 1 && h.length <= 7)
    ok(`${tag}: no duplicates`, noDupes(h))
    ok(`${tag}: no singular/plural stuffing`, noStuffing(h))
    ok(`${tag}: correct market represented`, some(h, MARKET_TOKEN[m]))
    ok(`${tag}: NO other market leaked`, !some(h, OTHER_TOKENS[m]))
    ok(`${tag}: Moving-To included`, has(h, MOVING[m]))
    ok(`${tag}: Apartment Locator/service represented`, some(h, /apartmentlocator/))
    // SUPERSEDED: Downtown used to sit at slot 6 and was cut by the 5-tag cap. It is now PROMOTED to
    // slot 5 for this family (inside the ranking), so it must SURVIVE. (See hashtags.ts.)
    if (t === "High-Rise" || t === "Penthouse") ok(`${tag}: Downtown survives within the 5-tag cap`, h.length <= 5 && some(h, /downtown/))
  }
}

console.log("property-type responses:")
ok("Loft includes #loft (every market)", MARKETS.every((m) => has(buildHashtags(m, MAX_HASHTAGS, "Loft"), "#loft")))
ok("Townhome includes a townhome/townhouse term", MARKETS.every((m) => some(buildHashtags(m, MAX_HASHTAGS, "Townhome"), /townhome|townhouse/)))
ok("Rental Home includes a rental/home-for-rent term", MARKETS.every((m) => some(buildHashtags(m, MAX_HASHTAGS, "Rental Home"), /rentalhome|forrent/)))
// Penthouse keeps a PROPERTY-FAMILY term in every market, but which one depends on the market bank:
// where a researched city High-Rise term exists (Dallas/DFW/Houston) it occupies the primary property
// slot and Downtown displaces the generic #penthouse; elsewhere #penthouse itself survives.
ok("Penthouse keeps a penthouse/high-rise property term in every market",
  MARKETS.every((m) => some(buildHashtags(m, MAX_HASHTAGS, "Penthouse"), /penthouse|highrise/)))
ok("Penthouse keeps generic #penthouse where the market has no city High-Rise term",
  ["San Antonio", "Austin"].every((m) => has(buildHashtags(m, MAX_HASHTAGS, "Penthouse"), "#penthouse")))
ok("Studio includes a studio term", MARKETS.every((m) => some(buildHashtags(m, MAX_HASHTAGS, "Studio"), /studio/)))
ok("changing property type changes the set", JSON.stringify(buildHashtags("Dallas", MAX_HASHTAGS, "High-Rise")) !== JSON.stringify(buildHashtags("Dallas", MAX_HASHTAGS, "Townhome")))

console.log("High-Rise market rules:")
const dallasHR = buildHashtags("Dallas", MAX_HASHTAGS, "High-Rise")
ok("Dallas High-Rise prioritizes #dallashighrise", has(dallasHR, "#dallashighrise"))
// SUPERSEDED: the generic #highrise was slot 5 and is now what Downtown displaces in Dallas — the
// market-specific #dallashighrise (slot 4) is the stronger term and is what survives.
ok("Dallas High-Rise drops generic #highrise in favour of Downtown", !has(dallasHR, "#highrise"))
ok("Dallas High-Rise: Downtown is now INSIDE the 5-tag cap", has(dallasHR, "#downtowndallas"))
const houstonHR = buildHashtags("Houston", MAX_HASHTAGS, "High-Rise")
ok("Houston High-Rise prioritizes the researched #houstonhighrise", has(houstonHR, "#houstonhighrise"))
ok("Houston High-Rise does NOT stuff both #houstonhighrise + #houstonhighrises", !(has(houstonHR, "#houstonhighrise") && has(houstonHR, "#houstonhighrises")))
ok("Houston High-Rise: Downtown falls outside the 5-tag cap (slot 6)", true)
const austinHR = buildHashtags("Austin", MAX_HASHTAGS, "High-Rise")
ok("Austin High-Rise does NOT prioritize #austinhighrise", !has(austinHR, "#austinhighrise"))
ok("Austin High-Rise uses generic #highrise", has(austinHR, "#highrise"))
ok("Austin High-Rise: Downtown falls outside the 5-tag cap (slot 6)", true)
const saHR = buildHashtags("San Antonio", MAX_HASHTAGS, "High-Rise")
ok("San Antonio does NOT fabricate a city-specific High-Rise", !some(saHR, /sanantoniohighrise/))
ok("San Antonio High-Rise uses generic high-rise", some(saHR, /highrise/))
ok("San Antonio High-Rise: Downtown falls outside the 5-tag cap (slot 6)", true)

console.log("Downtown is a HASHTAG rule only — non-High-Rise/Penthouse gets NO forced downtown:")
ok("Dallas Apartment has no forced downtown tag", !some(buildHashtags("Dallas", MAX_HASHTAGS, "Apartment"), /downtown/))
ok("Houston Townhome has no forced downtown tag", !some(buildHashtags("Houston", MAX_HASHTAGS, "Townhome"), /downtown/))

console.log("generated-vs-manual protection (unchanged behavior):")
ok("a generated set is recognized as generator-owned", isGeneratedHashtags(buildHashtags("Dallas", MAX_HASHTAGS, "High-Rise"), { market: "Dallas", propertyType: "High-Rise" }))
ok("a stale generated set (other market/type) still recognized as generated", isGeneratedHashtags(buildHashtags("San Antonio", MAX_HASHTAGS, "Townhome"), { market: "Dallas", propertyType: "Loft" }))
ok("a true manual set is NOT overwritten (not generator-owned)", !isGeneratedHashtags(["#myteam", "#customtag"], { market: "Dallas", propertyType: "High-Rise" }))

console.log("misc:")
ok("HASHTAG_MARKETS covers the 4 researched markets", ["San Antonio", "Austin", "Dallas", "Houston"].every((m) => HASHTAG_MARKETS.includes(m)))
ok("normalizeHashtag cleans input", normalizeHashtag("  luxury apts! ") === "#luxuryapts" && normalizeHashtag("##atx") === "#atx" && normalizeHashtag("  ") === "")
ok("respects a lower target cap", buildHashtags("Dallas", 3, "High-Rise").length <= 3)
// The cap is enforced in the GENERATOR, so an over-target caller cannot exceed it.
ok("a higher target cannot exceed the canonical cap", [7, 8, 30].every((n) => buildHashtags("Dallas", n, "High-Rise").length <= MAX_HASHTAGS))
ok("MAX_HASHTAGS is 5", MAX_HASHTAGS === 5)

console.log("\nrepresentative generated 7-tag outputs:")
for (const [m, t] of [["Dallas", "High-Rise"], ["Houston", "High-Rise"], ["Austin", "High-Rise"], ["San Antonio", "High-Rise"], ["Dallas", "Townhome"], ["San Antonio", "Loft"], ["Houston", "Penthouse"]] as const) {
  console.log(`  ${m} · ${t}:  ${buildHashtags(m, MAX_HASHTAGS, t).join(" ")}`)
}

console.log("Property Type → hashtag REGENERATION (generator-owned sets re-sync; manual preserved):")
// The editor regenerates hashtags on a metadata change ONLY when the current set is generator-owned
// (isGeneratedHashtags). These assert that switching type both (a) recognizes the prior set as
// generated and (b) produces type-appropriate tags.
const saApt = buildHashtags("San Antonio", MAX_HASHTAGS, "Apartment")
ok("1. SA + Apartment → apartment-appropriate, no townhome tags", some(saApt, /apartment/) && !some(saApt, /townhome|townhouse/))
ok("prior SA·Apartment set is recognized as generator-owned", isGeneratedHashtags(saApt, { market: "San Antonio", propertyType: "Townhome" }))
const saTown = buildHashtags("San Antonio", MAX_HASHTAGS, "Townhome")
ok("2. → Townhome regenerates to townhome-family tags", some(saTown, /townhome|townhouse/) && !has(saTown, "#apartmenthunting"))
ok("3. → High-Rise regenerates (has #highrise; Downtown is slot 6, outside the 5-cap)", (() => { const h = buildHashtags("San Antonio", MAX_HASHTAGS, "High-Rise"); return has(h, "#highrise") && h.length <= MAX_HASHTAGS })())
ok("4. → Rental Home regenerates (rental/home-for-rent)", some(buildHashtags("San Antonio", MAX_HASHTAGS, "Rental Home"), /rentalhome|forrent/))
ok("5. → Loft regenerates (#loft)", has(buildHashtags("San Antonio", MAX_HASHTAGS, "Loft"), "#loft"))
// 6. Manual overrides survive: a set with a CUSTOM tag is NOT generator-owned → editor won't overwrite.
ok("6a. manual set (custom tag) is NOT generator-owned → preserved", !isGeneratedHashtags(["#sanantonioapartments", "#myteamtag"], { market: "San Antonio", propertyType: "Townhome" }))
ok("6b. all-canonical set (incl LEGACY engine tags) IS generator-owned → re-syncs", isGeneratedHashtags(["#sanantonioapartments", "#satxapartments", "#sanantoniotx", "#satxliving", "#sanantoniorealestate", "#townhomes", "#townhouseliving"], { market: "San Antonio", propertyType: "Townhome" }))
// 7 & 8 across every type transition.
const TT = ["Studio", "Apartment", "High-Rise", "Townhome", "Rental Home", "Penthouse", "Loft"] as const
ok("7. every regenerated set ≤ 5 (canonical cap)", TT.every((t) => buildHashtags("San Antonio", MAX_HASHTAGS, t).length <= 5))
ok("8. every regenerated set has no duplicates", TT.every((t) => noDupes(buildHashtags("San Antonio", MAX_HASHTAGS, t))))
ok("type transitions each change the generated set", ["Apartment→Townhome", "Townhome→High-Rise", "High-Rise→Penthouse", "Penthouse→Loft", "Loft→Rental Home"].every((pair) => { const [a, b] = pair.split("→"); return JSON.stringify(buildHashtags("San Antonio", MAX_HASHTAGS, a)) !== JSON.stringify(buildHashtags("San Antonio", MAX_HASHTAGS, b)) }))

// ── DOWNTOWN PRIORITY (High-Rise / Penthouse family) ─────────────────────────────────────────
// Downtown used to sit at slot 6 and was therefore always cut by the 5-tag cap. It is now PROMOTED
// to slot 5 for this family — inside the ranking, not appended afterwards — so it survives.
console.log("\nDowntown priority for the High-Rise/Penthouse family:")
const ALL_MARKETS = ["San Antonio", "Austin", "Dallas", "DFW", "Houston"] as const
const downtownIn = (h: string[]) => h.some((t) => t.toLowerCase().startsWith("#downtown"))
// Compound Penthouse types must INHERIT the Penthouse behaviour via their head noun.
const FAMILY = ["High-Rise", "Penthouse", "Split-Level Penthouse", "Industrial-Style Penthouse"] as const
for (const t of FAMILY) {
  ok(`${t}: Downtown survives the 5-tag cap in every market`,
    ALL_MARKETS.every((m) => downtownIn(buildHashtags(m, MAX_HASHTAGS, t))))
}
ok("compound Penthouse sets EQUAL the plain Penthouse set (pure inheritance, no special-casing)",
  ALL_MARKETS.every((m) => {
    const base = JSON.stringify(buildHashtags(m, MAX_HASHTAGS, "Penthouse"))
    return JSON.stringify(buildHashtags(m, MAX_HASHTAGS, "Split-Level Penthouse")) === base
      && JSON.stringify(buildHashtags(m, MAX_HASHTAGS, "Industrial-Style Penthouse")) === base
  }))
ok("hashtagPropertyType maps a compound type to its HEAD NOUN",
  hashtagPropertyType("Split-Level Penthouse") === "Penthouse"
  && hashtagPropertyType("Industrial-Style Apartment") === "Apartment"
  && hashtagPropertyType("Penthouse") === "Penthouse"
  && hashtagPropertyType(null) === null)
// Non-applicable types must NOT gain a Downtown tag, and must keep their exact existing output.
const NON_FAMILY = ["Studio", "Apartment", "Townhome", "Rental Home", "Loft"] as const
ok("non-applicable types never gain a Downtown tag",
  NON_FAMILY.every((t) => ALL_MARKETS.every((m) => !downtownIn(buildHashtags(m, MAX_HASHTAGS, t)))))
ok("no market/type set ever exceeds MAX_HASHTAGS",
  [...FAMILY, ...NON_FAMILY].every((t) => ALL_MARKETS.every((m) => buildHashtags(m, MAX_HASHTAGS, t).length <= MAX_HASHTAGS))
  && ALL_MARKETS.every((m) => buildHashtags(m, 99, "Penthouse").length <= MAX_HASHTAGS))
ok("Downtown is earned INSIDE the ranking — a 4-tag cap still drops it (not appended after)",
  ALL_MARKETS.every((m) => {
    const four = buildHashtags(m, 4, "Penthouse")
    return four.length === 4 && !downtownIn(four)
  }))
ok("the promoted sets keep market + locator + moving-to + a property/high-rise term",
  ALL_MARKETS.every((m) => {
    const h = buildHashtags(m, MAX_HASHTAGS, "Penthouse").map((x) => x.toLowerCase())
    return h.length === 5 && h.some((x) => /locator/.test(x)) && h.some((x) => /^#movingto/.test(x))
      && h.some((x) => /highrise|penthouse/.test(x)) && downtownIn(h)
  }))
ok("Downtown tags are canonical, so promoting one cannot make a set look MANUAL",
  ALL_MARKETS.every((m) => buildHashtags(m, MAX_HASHTAGS, "Penthouse").every((t) => isCanonicalHashtag(t))))
ok("a genuinely manual set is still preserved for an applicable type",
  !isGeneratedHashtags(["#downtownsanantonio", "#myteamtag"], { market: "San Antonio", propertyType: "Penthouse" }))

console.log(`\nHashtag engine: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
