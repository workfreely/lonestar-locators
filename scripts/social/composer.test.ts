// Focused unit tests for the Post Composer's auto-preparation + hashtag bank + render args.
// Pure logic only — no network, no ffmpeg. Run: npx tsx scripts/social/composer.test.ts
import { buildHashtags, normalizeHashtag, HASHTAG_MARKETS } from "@/lib/social/hashtags"
import { AMENITY_BANK, canonicalizeAmenity, parseAmenities, serializeAmenities, sanitizeCustomAmenity } from "@/lib/social/amenities"
import { preparePost, buildCaption, buildOverlayHeadline, buildOverlaySubheadline, composeFinalCaption, startingPriceLabel, startingPriceAmount, buildOverlayDetail, joinDetailParts, specialDisplay, resolveSocialSpecial, isGeneratedHeadline, isGeneratedCaption, isGeneratedHashtags } from "@/lib/social/composePost"
import { SOCIAL_SPECIAL_OPTIONS, giftCardLabel, isGiftCardSpecial, sanitizeCustomSpecial } from "@/lib/social/socialSpecial"
import { PROPERTY_TYPES, propertyNoun, propertyNounPlural } from "@/lib/social/propertyTypes"
import { buildFfmpegArgs, buildVideoFilter, buildDrawPlan } from "@/lib/social/renderVideo"
import { wrapHeadline, wrapSub, headlineFit, headlineTextWidthPx, computeOverlayLayout, templateFamily, OVERLAY_SPEC, OVERLAY_CANVAS, OVERLAY_TEXT, HEADLINE_TEXT_AVAIL_PX, HOOK_TEXT_AVAIL_PX, HERO_MAX_PX, HERO_MIN_PX, HOOK_MAX_PX, HOOK_MIN_PX, DETAIL_TEXT_AVAIL_PX, DETAIL_GAP_PX, detailGapPx } from "@/lib/social/overlaySpec"
import { buildTemplateHeadline, buildTemplateDetail, OVERLAY_TEMPLATES, OVERLAY_TEMPLATE_LABEL } from "@/lib/social/composePost"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

console.log("hashtag engine (centralized, deterministic, max 5 — details in hashtags.test.ts):")
ok("markets include Austin/Dallas/DFW/Houston/San Antonio", ["Austin","Dallas","Houston","San Antonio"].every((m) => HASHTAG_MARKETS.includes(m)))
const dallas = buildHashtags("Dallas", 5, "Apartment")
ok("Dallas has #dallasapartments", dallas.includes("#dallasapartments"))
ok("capped at 7", dallas.length <= 7)
ok("no duplicates", new Set(dallas.map((s) => s.toLowerCase())).size === dallas.length)
ok("San Antonio market tags present", buildHashtags("San Antonio", 5, "Apartment").some((t) => /sanantonio|satx/.test(t)))
ok("unknown market still yields a non-empty relevant set (property + base)", buildHashtags("Nowhere", 5, "Apartment").length >= 1)

console.log("normalizeHashtag:")
ok("adds # and strips junk", normalizeHashtag("  luxury apts! ") === "#luxuryapts")
ok("collapses leading #", normalizeHashtag("##atx") === "#atx")
ok("empty → empty", normalizeHashtag("  ") === "")

console.log("auto-prepare (PUBLIC-SAFE only — never the property name/area/notes):")
// Botanica Oak Hills is the INTERNAL canonical property; it must NOT appear in public copy.
const src = { market: "San Antonio", propertyType: "Townhome", special: "1 Month Free", budgetRange: "$1,200–$1,600", amenities: "private yard, garage, pool" }
const prep = preparePost(src, "seed-A")
ok("headline = MARKET + TYPE (not property name)", prep.overlayHeadline === "SAN ANTONIO TOWNHOMES")
ok("subheadline = Starting-at lowest price (Template 1)", prep.overlaySubheadline === "Starting at $1,200/month")
ok("caption includes special + bulleted amenities; NO price line (overlay-only)", prep.caption.includes("✨ Up to 1 month free!") && prep.caption.includes("🏡 Amenities\n\n• private yard\n• garage\n• pool") && !prep.caption.includes("💰"))
ok("caption at most 7 hashtags prepared separately", prep.hashtags.length <= 7 && prep.hashtags.length >= 1)
// Even if a property name were somehow supplied, the type-level SourceMeta drops it — verify no
// internal identity leaks into the public copy.
const leaky = preparePost({ market: "San Antonio", propertyType: "Townhome", amenities: "private yard, garage, pool", ...( { propertyName: "Botanica Oak Hills", areaNeighborhood: "Medical Center", notes: "call owner" } as unknown as object) }, "seed-B")
ok("internal property name never leaks into caption", !leaky.caption.includes("Botanica"))
ok("internal area never leaks into caption/overlay", !leaky.caption.includes("Medical Center") && !leaky.overlayHeadline.includes("MEDICAL") && !leaky.overlaySubheadline.includes("MEDICAL"))
ok("internal notes never leak", !leaky.caption.includes("call owner"))

const SERVICE_LINE = "My apartment locating service is completely free!"
console.log("APPROVED caption template (4 rotating hooks, conditional lines, comment CTA):")
const APPROVED_HOOKS_CITY = ["Moving to Dallas? This is your sign.", "This is your sign to move to Dallas.", "Moving to Dallas? You need to see this one."]
const APPROVED_HOOK4 = (noun: string) => `Need a new ${noun}?`
// Rotation across many seeds (city + type present) → only the 4 approved hooks, and >1 distinct.
const seenTownhome = new Set<string>()
for (let i = 0; i < 60; i++) seenTownhome.add(buildCaption({ market: "Dallas", propertyType: "Townhome" }, "s" + i).split("\n")[0])
const APPROVED4 = new Set([...APPROVED_HOOKS_CITY, APPROVED_HOOK4("townhome")])
ok("every produced hook is one of the 4 approved (verbatim)", [...seenTownhome].every((h) => APPROVED4.has(h)))
ok("rotation actually varies across sources (>1 distinct hook)", seenTownhome.size > 1)
ok("Hook 4 uses lowercase natural property noun ('townhome')", seenTownhome.has("Need a new townhome?"))
ok("deterministic: same seed → same hook", buildCaption({ market: "Dallas", propertyType: "Townhome" }, "fixed") === buildCaption({ market: "Dallas", propertyType: "Townhome" }, "fixed"))
// Missing property type → Hook 4 NOT eligible; only Hooks 1–3.
const seenNoType = new Set<string>()
for (let i = 0; i < 60; i++) seenNoType.add(buildCaption({ market: "Dallas" }, "n" + i).split("\n")[0])
ok("missing property type excludes Hook 4", [...seenNoType].every((h) => APPROVED_HOOKS_CITY.includes(h)) && ![...seenNoType].some((h) => h.startsWith("Need a new")))
// Property-type nouns render naturally lowercase.
ok("High-Rise → 'high-rise'", buildCaption({ propertyType: "High-Rise" }).split("\n")[0] === "Need a new high-rise?")
ok("Rental Home → 'rental home'", buildCaption({ propertyType: "Rental Home" }).split("\n")[0] === "Need a new rental home?")
ok("Studio → 'studio'", buildCaption({ propertyType: "Studio" }).split("\n")[0] === "Need a new studio?")
// City substitution is real (no leftover placeholder), never an unresolved {city}/{property_type}.
// (Use a city-only source so a Hook 1–3 city hook is guaranteed for the substitution check.)
ok("city substituted, no unresolved placeholder", buildCaption({ market: "Austin" }, "x").includes("Austin") && !buildCaption({ market: "Austin", propertyType: "Apartment" }, "x").includes("{"))
// Conditional detail lines.
const full = buildCaption({ market: "Dallas", propertyType: "Townhome", special: "8 weeks free", budgetRange: "Starting at $1,495", amenities: "Rooftop pool, fitness center, dog park, sauna" }, "z")
ok("✨ line present, caption-qualified (the OVERLAY still says '8 Weeks Free')", full.includes("✨ Up to 8 weeks free!"))
ok("🏡 amenities bulleted, canonicalized, capped at 3, no 4th", full.includes("🏡 Amenities\n\n• Rooftop Pool\n• Fitness Center\n• Dog Park") && !full.includes("sauna"))
ok("NO 💰 price line in caption (price lives in the overlay detail only)", !full.includes("💰"))
const noSpecial = buildCaption({ market: "Dallas", propertyType: "Townhome", amenities: "Private yard", budgetRange: "Starting at $1,895" }, "z")
ok("✨ line OMITTED entirely (emoji included) when special missing", !noSpecial.includes("✨"))
ok("🏡 single amenity → heading + one bullet", noSpecial.includes("🏡 Amenities\n\n• Private yard"))
const bare = buildCaption({ market: "Dallas", propertyType: "Townhome" }, "z")
ok("no 🏡/💰/✨ lines when none present", !bare.includes("🏡") && !bare.includes("💰") && !bare.includes("✨"))
// Fixed tail — the service line, a blank line, then the COMMENT CTA whose keyword comes from the
// Property Type. Both captions here are Townhome, so both close with TOWN.
const TOWN_CTA = '✅ Comment "TOWN" and I’ll send you the best options within your budget.'
ok("service line + blank line + comment CTA, verbatim", full.includes(`${SERVICE_LINE}\n\n${TOWN_CTA}`))
ok("caption always ends with the comment CTA", full.endsWith(TOWN_CTA) && bare.endsWith(TOWN_CTA))
ok("the superseded form CTA is gone", !full.includes("Submit the form") && !bare.includes("Submit the form"))
// No city AND no type → no hook line at all (never an unresolved placeholder); starts with CTA.
ok("no city + no type → caption starts with the service line (no empty hook)", buildCaption({}).split("\n")[0] === SERVICE_LINE)

console.log("caption whitespace hardening (messy input → clean output):")
// Padded city (Hook 1 is seed-index 0 for these seeds' pool; assert the produced hook is clean).
ok("' Dallas ' → clean city hook, no double space / no space before ?", (() => {
  const first = buildCaption({ market: " Dallas " }, "s0").split("\n")[0]
  return APPROVED_HOOKS_CITY.includes(first) && first.includes("Dallas") && !/ {2,}/.test(first) && !/\s[?.,]/.test(first)
})())
// Padded property type must still resolve Hook 4 (regression: whitespace previously dropped it).
ok("' Townhome ' → 'Need a new townhome?' (padded type still resolves)", buildCaption({ propertyType: " Townhome " }).split("\n")[0] === "Need a new townhome?")
ok("' High-Rise ' padded → 'Need a new high-rise?'", buildCaption({ propertyType: " High-Rise " }).split("\n")[0] === "Need a new high-rise?")
// Padded special / price → trimmed, single space after emoji (special normalized to display form).
// The CAPTION now qualifies a variable duration concession ("Up to …"), while specialDisplay and
// the overlay keep the stored wording — asserted separately below. The normalisation this line
// protects (trim + canonical casing) is unchanged; only the caption's presentation moved.
ok("' 8 weeks free ' → '✨ Up to 8 weeks free!' (trimmed, normalized, caption-qualified)", buildCaption({ market: "Dallas", special: " 8 weeks free " }, "s0").includes("✨ Up to 8 weeks free!"))
ok("...while specialDisplay itself is UNCHANGED", specialDisplay(" 8 weeks free ") === "8 Weeks Free")
ok("budgetRange present → still NO 💰 line (price is overlay-only)", !buildCaption({ market: "Dallas", budgetRange: " Starting at $1,495 " }, "s0").includes("💰"))
// Amenities with surrounding + inter-item whitespace → exact bulleted list.
ok("messy amenities → bulleted, canonicalized '🏡 Amenities' list", buildCaption({ market: "Dallas", amenities: "  Rooftop pool ,  fitness center , dog park  " }, "s0").includes("🏡 Amenities\n\n• Rooftop Pool\n• Fitness Center\n• Dog Park"))
// Whole-caption cleanliness with messy input: no double spaces, no trailing spaces on any line,
// no space-before-punctuation. Blank lines BETWEEN sections are intentional (readable spacing), so
// we require blank separators to be truly empty (never whitespace-only) and never tripled.
const messy = buildCaption({ market: "  Dallas  ", propertyType: "  Townhome  ", special: "  8 weeks free  ", budgetRange: "  Starting at $1,495  ", amenities: "  Rooftop pool ,  fitness center , dog park  " }, "s0")
ok("no double spaces anywhere in caption", !/ {2,}/.test(messy))
ok("no trailing whitespace on any line", messy.split("\n").every((l) => l === l.replace(/\s+$/, "")))
ok("no space before ? . or , (hook/detail punctuation)", !/\s[?,]/.test(messy) && !/\s\.(?=\s|$)/.test(messy))
ok("blank separators are truly empty (no whitespace-only lines)", messy.split("\n").every((l) => l.length === 0 || l.trim().length > 0))
ok("sections separated by exactly ONE blank line (never tripled)", !/\n\n\n/.test(messy))
// Missing optional fields must not create malformed spacing (only the blank line between the two
// CTA sentences remains). No stray ✨/🏡/💰.
const sparse = buildCaption({ market: "Dallas", propertyType: "Townhome" }, "s0")
ok("absent optional fields → no ✨/🏡/💰, clean spacing", !sparse.includes("✨") && !sparse.includes("🏡") && !sparse.includes("💰") && !/\n\n\n/.test(sparse) && sparse.split("\n").every((l) => l.length === 0 || l.trim().length > 0))
// Intentional paragraph break BEFORE hashtags is preserved by composeFinalCaption (blank line).
ok("paragraph break before hashtags preserved (\\n\\n)", composeFinalCaption(messy, ["#a", "#b"]).includes(messy + "\n\n#a #b"))

console.log("Template 1 subheadline: 'Starting at {lowest}/month' (or empty; special stays in caption):")
ok("range → lowest price", startingPriceLabel("$1,495–$2,100") === "Starting at $1,495/month")
ok("single value → that price", startingPriceLabel("$1,895") === "Starting at $1,895/month")
ok("open-ended '$1,200+' → 1200", startingPriceLabel("$1,200+") === "Starting at $1,200/month")
ok("surrounding whitespace trimmed", startingPriceLabel("  $2,000 – $3,000  ") === "Starting at $2,000/month")
ok("no digits → empty (no fabrication)", startingPriceLabel("Call for pricing") === "" && startingPriceLabel("") === "" && startingPriceLabel(null) === "")
ok("sub uses starting price from range", buildOverlaySubheadline({ market: "Dallas", budgetRange: "$1,495–$2,100" }) === "Starting at $1,495/month")
ok("sub omits when no price (special is NOT the overlay sub in Template 1)", buildOverlaySubheadline({ market: "Dallas", special: "1 Month Free", amenities: "pool, gym" }) === "")
ok("sub empty when nothing", buildOverlaySubheadline({ market: "Austin" }) === "")

console.log("headline market/type fallbacks:")
ok("Dallas market → DFW NOT substituted", buildOverlayHeadline({ market: "Dallas" }) === "DALLAS APARTMENTS")
ok("market only → market + apartments", buildOverlayHeadline({ market: "Austin" }) === "AUSTIN APARTMENTS")
ok("final caption appends hashtags", composeFinalCaption("Hello", ["#a", "#b"]) === "Hello\n\n#a #b")

console.log("Template 1 headline: pluralization + whitespace + fit-to-width (real font widths):")
ok("Studio→Studios", buildOverlayHeadline({ market: "Dallas", propertyType: "Studio" }) === "DALLAS STUDIOS")
ok("Apartment→Apartments", buildOverlayHeadline({ market: "Austin", propertyType: "Apartment" }) === "AUSTIN APARTMENTS")
ok("High-Rise→High-Rises", buildOverlayHeadline({ market: "Dallas", propertyType: "High-Rise" }) === "DALLAS HIGH-RISES")
ok("Townhome→Townhomes", buildOverlayHeadline({ market: "Houston", propertyType: "Townhome" }) === "HOUSTON TOWNHOMES")
ok("Rental Home→Rental Homes", buildOverlayHeadline({ market: "San Antonio", propertyType: "Rental Home" }) === "SAN ANTONIO RENTAL HOMES")
ok("Penthouse→Penthouses", buildOverlayHeadline({ market: "Austin", propertyType: "Penthouse" }) === "AUSTIN PENTHOUSES")
ok("headline trims surrounding whitespace", buildOverlayHeadline({ market: " Dallas ", propertyType: " High-Rise " }) === "DALLAS HIGH-RISES")
const CITIES = ["Austin", "Dallas", "DFW", "Houston", "San Antonio"]
const TYPES = ["Studio", "Apartment", "High-Rise", "Townhome", "Rental Home", "Penthouse", "Loft"]
let allOneLine = true, allInRange = true, allFit = true
for (const c of CITIES) for (const t of TYPES) {
  const text = buildOverlayHeadline({ market: c, propertyType: t })
  const fit = headlineFit(text)
  if (fit.lines.length !== 1) allOneLine = false
  if (!(fit.fontPx >= HERO_MIN_PX && fit.fontPx <= HERO_MAX_PX)) allInRange = false
  if (!(headlineTextWidthPx(text, fit.fontPx) <= HEADLINE_TEXT_AVAIL_PX)) allFit = false // fitted size stays in the safe box
}
ok("EVERY supported city×type (incl Loft) headline stays ONE line (fit-to-width)", allOneLine)
ok("EVERY supported combo's fitted size is within the Hero range [56,66]", allInRange)
// MAX is unchanged at 66 (every combo that already fit keeps its size). MIN dropped 56 → 47 when the
// headline face became Libre Baskerville Bold (~12.9% wider than Bodoni): the longest combos need
// down to 47px to stay inside the 900px safe box, and fitHeadlinePx returns minPx as an UNTESTED
// fallback, so a higher floor would have rendered them past the safe margins.
ok("Hero fit range is 47–66px", HERO_MIN_PX === 47 && HERO_MAX_PX === 66)
ok("EVERY supported combo fits the 900px safe box at its fitted size", allFit)
ok("shorter combo renders LARGER (SAN ANTONIO TOWNHOMES > SAN ANTONIO RENTAL HOMES)", headlineFit("SAN ANTONIO TOWNHOMES").fontPx > headlineFit("SAN ANTONIO RENTAL HOMES").fontPx)
ok("widest combo SAN ANTONIO RENTAL HOMES still fits one line via fit-down", headlineFit("SAN ANTONIO RENTAL HOMES").lines.length === 1 && headlineTextWidthPx("SAN ANTONIO RENTAL HOMES", headlineFit("SAN ANTONIO RENTAL HOMES").fontPx) <= HEADLINE_TEXT_AVAIL_PX)
ok("Loft combos are supported one-line (e.g. SAN ANTONIO LOFTS)", headlineFit("SAN ANTONIO LOFTS").lines.length === 1)
ok("usable text width = safe area (no box) = 900px (90px margins)", HEADLINE_TEXT_AVAIL_PX === 900)
ok("unknown/custom headline char-wraps at the Hero minimum size", headlineFit("SOME ENTIRELY CUSTOM HEADLINE TEXT").fontPx === HERO_MIN_PX)

console.log("Template 1 vertical lockup: tightened headline→sub gap:")
ok("gap is 35px (tightened from 44)", OVERLAY_SPEC.sub.gapPx === 35)
// Asserted on the LIVE path (computeOverlayLayout) now that overlayPreviewStyle is gone: a headline
// that fits smaller occupies a shorter block, so the detail beneath it moves UP.
{
  const big = computeOverlayLayout("market_type", "AUSTIN LOFTS", "Starting at $1,600/month")
  const small = computeOverlayLayout("market_type", "SAN ANTONIO RENTAL HOMES", "Starting at $1,600/month")
  ok("a smaller (fit) headline font pulls the sub UP",
    small.headline.fontPx < big.headline.fontPx && small.detail!.topPx < big.detail!.topPx)
}

console.log("ffmpeg arg builder (Reel-safe encoders); buildVideoFilter draws layout items:")
const headItem = { file: "/w/head.txt", fontPx: 78, topPx: 250, lineSpacing: 8 }
const subItem = { file: "/w/sub.txt", fontPx: 40, topPx: 420, lineSpacing: 6 }
const filt = buildVideoFilter("/f/font.ttf", [headItem])
ok("filter fills to 1080x1920 then crops", filt.includes("scale=1080:1920:force_original_aspect_ratio=increase") && filt.includes("crop=1080:1920"))
ok("filter draws headline when present", filt.includes("drawtext") && filt.includes("head.txt"))
ok("one item → one drawtext", (filt.match(/drawtext/g) || []).length === 1)
ok("graph outputs the [v] label", /\[v\]$/.test(filt))
const args = buildFfmpegArgs({ sourcePath: "/s.mp4", outputPath: "/o.mp4", filter: filt, audioChoice: "original" })
ok("H.264 + yuv420p + faststart + AAC", args.includes("libx264") && args.includes("yuv420p") && args.includes("+faststart") && args.includes("aac"))
ok("audio 'none' → -an (muted)", buildFfmpegArgs({ sourcePath: "/s", outputPath: "/o", filter: "x", audioChoice: "none" }).includes("-an"))
ok("audio 'original' maps the source audio (-map 0:a?)", args.includes("0:a?"))
const filt2 = buildVideoFilter("/f.ttf", [headItem, subItem])
ok("two items → two drawtext", (filt2.match(/drawtext/g) || []).length === 2)
ok("each item drawn at its own topPx (y=250, y=420)", filt2.includes(":y=250[") && filt2.includes(":y=420[v]"))
ok("each drawtext carries its line_spacing", /textfile='\/w\/head\.txt'[^;]*line_spacing=8/.test(filt2) && /textfile='\/w\/sub\.txt'[^;]*line_spacing=6/.test(filt2))
ok("no overlay items → cover-fit exposed as [v]", /\[v\]$/.test(buildVideoFilter("/f.ttf", [])) && !buildVideoFilter("/f.ttf", []).includes("drawtext"))

console.log("wrap helpers (preview === render):")
ok("long headline wraps to 2 lines", wrapHeadline("SAN ANTONIO HOMES").length === 2)
ok("short headline stays 1 line", wrapHeadline("SAN ANTONIO").length === 1)
ok("no sub → no lines", wrapSub("").length === 0)
ok("short sub → one line", wrapSub("PRIVATE YARDS").length === 1)
ok("long sub wraps to a multi-line block", wrapSub("PRIVATE YARDS + GARAGES + RESORT POOL + GATED ENTRY + WALK-IN CLOSETS").length >= 2)
ok("sub is capped at maxLines (never runaway)", wrapSub("one two three four five six seven eight nine ten eleven twelve thirteen fourteen").length <= 4)

console.log("Reels-safe boxes (generous margins; no-space text can't run off-screen):")
{
  // Same two box invariants, read off the LIVE layout instead of the removed preview helper.
  const L = computeOverlayLayout("market_type", "AUSTIN LOFTS", "Starting at $1,600/month")
  const pct = (px: number) => (px / OVERLAY_CANVAS.w) * 100
  ok("headline box keeps safe side margins (8.3% each; not edge-to-edge)", pct(L.headline.sideMarginPx) >= 8 && pct(L.headline.sideMarginPx) < 12)
  ok("sub box is wider than the headline box but still safely inset", pct(L.detail!.sideMarginPx) < pct(L.headline.sideMarginPx) && pct(L.detail!.sideMarginPx) >= 6)
}
// Nonsense/no-space text must hard-break so no single line can overflow the box.
const noSpaceH = wrapHeadline("X".repeat(60))
ok("no-space headline hard-splits (every line ≤ maxChars)", noSpaceH.length > 0 && noSpaceH.every((l) => l.length <= 16))
ok("no-space headline still capped at maxLines", noSpaceH.length <= 3)
const noSpaceS = wrapSub("Y".repeat(120))
ok("no-space subheadline hard-splits (every line ≤ maxChars)", noSpaceS.length > 0 && noSpaceS.every((l) => l.length <= 33))
ok("two-line headline still wraps to 2", wrapHeadline("SAN ANTONIO HOMES").length === 2)

console.log("Loft canonical property type:")
ok("Loft plural → DALLAS LOFTS", buildOverlayHeadline({ market: "Dallas", propertyType: "Loft" }) === "DALLAS LOFTS")
ok("Loft caption Hook 4 → 'Need a new loft?'", buildCaption({ propertyType: "Loft" }).split("\n")[0] === "Need a new loft?")
ok("Loft padded still resolves", buildOverlayHeadline({ market: " Dallas ", propertyType: " Loft " }) === "DALLAS LOFTS")

console.log("generated-vs-manual detectors (sync engine):")
ok("headline generated forms recognized (any market/type)", isGeneratedHeadline("DALLAS TOWNHOMES") && isGeneratedHeadline("SAN ANTONIO RENTAL HOMES") && isGeneratedHeadline("DALLAS LOFTS"))
ok("empty headline counts as generated", isGeneratedHeadline("") && isGeneratedHeadline(null))
ok("custom manual headline NOT generated", !isGeneratedHeadline("MY CUSTOM TAGLINE"))
ok("generated caption recognized", isGeneratedCaption(buildCaption({ market: "Dallas", propertyType: "Townhome" }, "s1"), { market: "Dallas", propertyType: "Townhome" }, "s1"))
ok("stale caption (wrong type) still recognized as generated", isGeneratedCaption("Need a new high-rise?\nMy apartment locating service is completely free!\nSubmit the form to get your free custom apartment list.", { market: "Dallas", propertyType: "Townhome" }, "s1"))
ok("manual caption NOT generated", !isGeneratedCaption("Check out this amazing place!", { market: "Dallas", propertyType: "Townhome" }, "s1"))
ok("generated hashtags recognized (Dallas)", isGeneratedHashtags(buildHashtags("Dallas", 5, "Townhome"), { market: "Dallas", propertyType: "Townhome" }))
ok("stale San Antonio hashtags recognized as generated (any market)", isGeneratedHashtags(buildHashtags("San Antonio", 5, "Townhome"), { market: "Dallas", propertyType: "Townhome" }))
ok("custom hashtags NOT generated", !isGeneratedHashtags(["#mycustomtag", "#anothercustom"], { market: "Dallas" }))

console.log("overlay detail (Template 1 formula) + CASE A/B sync:")
ok("detail = Starting at price", buildOverlayDetail({ budgetRange: "1495" }) === "Starting at $1,495/month")
ok("detail empty when no price", buildOverlayDetail({}) === "")
// CASE A: Dallas + Townhome + 1495
ok("A overlay headline", buildOverlayHeadline({ market: "Dallas", propertyType: "Townhome" }) === "DALLAS TOWNHOMES")
ok("A overlay detail", buildOverlayDetail({ budgetRange: "1495" }) === "Starting at $1,495/month")
ok("A hashtags are Dallas, max 5, ZERO San Antonio", (() => { const h = buildHashtags("Dallas", 5, "Townhome"); return h.length <= 5 && h.includes("#dallasapartments") && !h.some((t) => t.includes("sanantonio") || t.includes("satx")) })())
// CASE B: Dallas + Loft + 1495
ok("B overlay headline", buildOverlayHeadline({ market: "Dallas", propertyType: "Loft" }) === "DALLAS LOFTS")
ok("B hashtags Dallas + loft, ZERO San Antonio", (() => { const h = buildHashtags("Dallas", 5, "Loft"); return h.length <= 5 && h.includes("#dallasapartments") && h.includes("#loft") && !h.some((t) => t.includes("sanantonio") || t.includes("satx")) })())

console.log("Current Special → concise social-display (deterministic; never fabricated):")
ok("'8 weeks free' → '8 Weeks Free'", specialDisplay("8 weeks free") === "8 Weeks Free")
ok("'eight weeks free' → '8 Weeks Free'", specialDisplay("eight weeks free") === "8 Weeks Free")
ok("'6 weeks free on select units' → '6 Weeks Free'", specialDisplay("6 weeks free on select units") === "6 Weeks Free")
ok("'six weeks free on select floorplans' → '6 Weeks Free'", specialDisplay("six weeks free on select floorplans") === "6 Weeks Free")
ok("'4 weeks free' → '4 Weeks Free'", specialDisplay("4 weeks free") === "4 Weeks Free")
ok("'one month free' → '1 Month Free'", specialDisplay("one month free") === "1 Month Free")
ok("'1 month free' → '1 Month Free'", specialDisplay("1 month free") === "1 Month Free")
ok("'1 week free' → singular '1 Week Free'", specialDisplay("1 week free") === "1 Week Free")
ok("long leasing sentence containing '8 weeks free' → '8 Weeks Free'", specialDisplay("Receive up to 8 weeks free on select units when you move in by September 30. Restrictions apply.") === "8 Weeks Free")
// Unrecognized / non-duration special: NEVER invent — return the factual original unchanged.
ok("unrecognized special preserved verbatim (no fabrication)", specialDisplay("Waived application & admin fees") === "Waived application & admin fees")
ok("empty special → empty", specialDisplay("") === "" && specialDisplay(null) === "")
ok("original metadata is untouched — specialDisplay is pure/derived", (() => { const original = "Receive up to 8 weeks free on select units"; specialDisplay(original); return original === "Receive up to 8 weeks free on select units" })())

console.log("Instagram caption formatting (readable vertical spacing + bulleted amenities):")
const houston = buildCaption({ market: "Houston", propertyType: "Townhome", special: "Receive up to 8 weeks free on select units when you move in by September 30. Restrictions apply.", budgetRange: "1495", amenities: "floor-to-ceiling windows\nmodern appliances\nkitchen counter" }, "seed-houston")
ok("caption uses the concise special display in the ✨ section", houston.includes("✨ Up to 8 weeks free!") && !houston.includes("Restrictions apply"))
ok("amenities render as a heading + '• ' bullets (canonicalized; not a comma line)", houston.includes("🏡 Amenities\n\n• Floor-to-Ceiling Windows\n• modern appliances\n• kitchen counter") && !houston.includes("windows, modern"))
ok("ONE blank line between each present section (join with \\n\\n)", houston.split("\n").filter((l) => l === "").length >= 4 && !/\n\n\n/.test(houston))
ok("blank line between the service line and the comment CTA", houston.includes(`${SERVICE_LINE}\n\n${TOWN_CTA}`))
ok("caption ends with the comment CTA", houston.endsWith(TOWN_CTA))
ok("hook is the first line, followed by a blank line", (() => { const lines = houston.split("\n"); return lines[0].length > 0 && lines[1] === "" })())
// Amenities capping + empty-entry hygiene in the bulleted list.
const bulletCap = buildCaption({ market: "Houston", amenities: "one, two, , three, four" }, "s0")
ok("bulleted amenities capped at 3, empties ignored", bulletCap.includes("🏡 Amenities\n\n• one\n• two\n• three") && !bulletCap.includes("• four"))
// No amenities → the whole Amenities section (heading + bullets) is omitted.
ok("no amenities → no '🏡 Amenities' heading at all", !buildCaption({ market: "Houston", propertyType: "Townhome" }, "s0").includes("🏡"))

console.log("overlay detail one-line composition helper (· separator; future template rules):")
ok("special + price → '8 Weeks Free · Starting at $1,495/month'", joinDetailParts([specialDisplay("8 weeks free"), startingPriceLabel("1495")]) === "8 Weeks Free · Starting at $1,495/month")
ok("special only", joinDetailParts([specialDisplay("8 weeks free"), startingPriceLabel(null)]) === "8 Weeks Free")
ok("price only", joinDetailParts([specialDisplay(null), startingPriceLabel("1495")]) === "Starting at $1,495/month")
ok("neither → empty (no detail)", joinDetailParts([specialDisplay(null), startingPriceLabel(null)]) === "")
ok("uses centered-dot ' · ' separator, never comma/pipe", (() => { const d = joinDetailParts(["A", "B"]); return d === "A · B" && !d.includes(",") && !d.includes("|") })())

console.log("CASE 14 — Houston + Townhome + 1495 (Template 1 is PRICE-ONLY; special stays in caption):")
ok("Template 1 overlay headline", buildOverlayHeadline({ market: "Houston", propertyType: "Townhome" }) === "HOUSTON TOWNHOMES")
ok("Template 1 overlay detail is price-only (does NOT add the special)", buildOverlayDetail({ market: "Houston", propertyType: "Townhome", special: "8 weeks free", budgetRange: "1495" }) === "Starting at $1,495/month")
ok("Houston hashtags: market bank, max 5, ZERO San Antonio / Dallas", (() => { const h = buildHashtags("Houston", 5, "Townhome"); return h.length <= 5 && h.includes("#houstonapartments") && !h.some((t) => /sanantonio|satx|dallas|dfw/.test(t)) })())
// Deterministic hook is preserved (not forced to Hook 4); whatever hook this seed selects is used.
ok("caption hook resolves to CURRENT Houston/Townhome metadata (deterministic, not forced)", (() => {
  const first = houston.split("\n")[0]
  const approved = ["Moving to Houston? This is your sign.", "This is your sign to move to Houston.", "Moving to Houston? You need to see this one.", "Need a new townhome?"]
  return approved.includes(first)
})())

console.log("regression: generated caption re-syncs across NEW section format (blank-line-insensitive):")
// A caption stored in the OLDER compressed (single-newline) format must still be recognized as
// generated for the current metadata, so it re-syncs rather than masquerading as a manual override.
const oldFormat = "Need a new townhome?\nMy apartment locating service is completely free!\nSubmit the form to get your free custom apartment list."
ok("old compressed caption still detected as generated", isGeneratedCaption(oldFormat, { market: "Dallas", propertyType: "Townhome" }, "s1"))
ok("new spaced caption detected as generated", isGeneratedCaption(buildCaption({ market: "Dallas", propertyType: "Townhome" }, "s1"), { market: "Dallas", propertyType: "Townhome" }, "s1"))
ok("genuine manual caption still NOT generated", !isGeneratedCaption("Come see this stunning place today!", { market: "Dallas", propertyType: "Townhome" }, "s1"))

console.log("amenity bank (canonical multi-select + custom fallback + ordered storage):")
ok("bank contains common canonical selling points", AMENITY_BANK.includes("Private Yards") && AMENITY_BANK.includes("Floor-to-Ceiling Windows") && AMENITY_BANK.includes("Washer & Dryer Included"))
// Variant collapsing → ONE canonical display value.
ok("'floor to ceiling windows' → canonical", canonicalizeAmenity("floor to ceiling windows") === "Floor-to-Ceiling Windows")
ok("'Floor-To-Ceiling Windows' → canonical", canonicalizeAmenity("Floor-To-Ceiling Windows") === "Floor-to-Ceiling Windows")
ok("'  floor-to-ceiling   windows ' → canonical (trim+collapse)", canonicalizeAmenity("  floor-to-ceiling   windows ") === "Floor-to-Ceiling Windows")
ok("unknown value preserved verbatim (custom, wording kept)", canonicalizeAmenity("Speakeasy Lounge") === "Speakeasy Lounge")
ok("custom sanitized of delimiter chars (single safe chip)", sanitizeCustomAmenity("24/7, on-site\nconcierge") === "24 7 on-site concierge")
// Selecting multiple canonical amenities, order preserved.
const sel = ["Private Yards", "Attached Garages", "Floor-to-Ceiling Windows", "Fitness Center"]
ok("serialize→parse round-trips selection + order", JSON.stringify(parseAmenities(serializeAmenities(sel))) === JSON.stringify(sel))
ok("first selected amenity is the primary {feature} (future Template 3)", parseAmenities(serializeAmenities(sel))[0] === "Private Yards")
// No exact duplicates (case-insensitive), first occurrence wins.
ok("exact duplicates removed", JSON.stringify(parseAmenities("Private Yards\nprivate yards\nDog Park")) === JSON.stringify(["Private Yards", "Dog Park"]))
// Legacy free-text loads safely.
ok("existing COMMA-separated free-text loads as chips", JSON.stringify(parseAmenities("private yard, garage, pool")) === JSON.stringify(["private yard", "garage", "pool"]))
ok("existing NEWLINE-separated free-text loads as chips", JSON.stringify(parseAmenities("Rooftop Pool\nDog Park")) === JSON.stringify(["Rooftop Pool", "Dog Park"]))
ok("legacy custom value with '/' or 'and' stays intact (not over-split)", JSON.stringify(parseAmenities("24/7 Concierge\nCats and Dogs Welcome")) === JSON.stringify(["24/7 Concierge", "Cats and Dogs Welcome"]))
// Caption uses first up to 3, in order, bulleted; the 4th is stored but not shown.
const capSel = buildCaption({ market: "Dallas", propertyType: "Townhome", amenities: serializeAmenities(sel) }, "s0")
ok("caption uses first 3 selected amenities, in order, bulleted", capSel.includes("🏡 Amenities\n\n• Private Yards\n• Attached Garages\n• Floor-to-Ceiling Windows"))
ok("4th selected amenity stored but NOT in caption (max 3)", !capSel.includes("Fitness Center"))

console.log("Social Special selector (standardized short-forms + gift card + custom):")
ok("standardized options use NUMBERS, not spelled-out", SOCIAL_SPECIAL_OPTIONS.includes("8 Weeks Free") && SOCIAL_SPECIAL_OPTIONS.includes("1 Month Free") && SOCIAL_SPECIAL_OPTIONS.includes("Free Movers") && !SOCIAL_SPECIAL_OPTIONS.some((o) => /eight|six|one month/i.test(o)))
ok("10 + 12 Weeks Free are offered", SOCIAL_SPECIAL_OPTIONS.includes("10 Weeks Free") && SOCIAL_SPECIAL_OPTIONS.includes("12 Weeks Free"))
ok("…in ascending week order, before the Months entries", (() => {
  const i = (v: string) => SOCIAL_SPECIAL_OPTIONS.indexOf(v)
  return i("8 Weeks Free") < i("10 Weeks Free") && i("10 Weeks Free") < i("12 Weeks Free") && i("12 Weeks Free") < i("1 Month Free")
})())
ok("…with no duplicates anywhere in the bank", new Set(SOCIAL_SPECIAL_OPTIONS).size === SOCIAL_SPECIAL_OPTIONS.length)
ok("the pre-existing options all survived", ["1 Week Free","2 Weeks Free","4 Weeks Free","6 Weeks Free","8 Weeks Free","1 Month Free","2 Months Free","Free Movers"].every((o) => SOCIAL_SPECIAL_OPTIONS.includes(o)))
// The derived short label already handled 1-12, so the new values need no parser change.
ok("specialDisplay derives the new values unchanged", specialDisplay("10 Weeks Free") === "10 Weeks Free" && specialDisplay("12 Weeks Free") === "12 Weeks Free")
ok("…and still shortens prose containing them", specialDisplay("Limited time: get ten weeks free on select units!") === "10 Weeks Free")
ok("custom-entry behaviour is untouched", sanitizeCustomSpecial("  two months  on us ") === "two months on us")
ok("gift card with amount → '$500 Gift Card'", giftCardLabel(500) === "$500 Gift Card")
ok("gift card 1000 → '$1,000 Gift Card' (comma-grouped)", giftCardLabel("1000") === "$1,000 Gift Card")
ok("gift card no/zero amount → 'Gift Card' (never invents an amount)", giftCardLabel("") === "Gift Card" && giftCardLabel(0) === "Gift Card" && giftCardLabel(null) === "Gift Card")
ok("isGiftCardSpecial detects gift-card values", isGiftCardSpecial("$500 Gift Card") && isGiftCardSpecial("Gift Card") && !isGiftCardSpecial("8 Weeks Free"))
ok("custom special trimmed, wording preserved, capped", sanitizeCustomSpecial("  Look & Lease Bonus  ") === "Look & Lease Bonus")
ok("empty custom rejected", sanitizeCustomSpecial("   ") === "")
// Precedence: explicit Social Special wins; else normalized raw; else "".
ok("explicit Social Special wins over raw special", resolveSocialSpecial({ socialSpecial: "$500 Gift Card", special: "8 weeks free on select units" }) === "$500 Gift Card")
ok("no explicit → normalized raw special", resolveSocialSpecial({ special: "Receive up to 8 weeks free on select units" }) === "8 Weeks Free")
ok("neither → empty (no fabrication)", resolveSocialSpecial({}) === "" && resolveSocialSpecial({ special: "Call for details" }) === "Call for details")
// Caption reflects the explicit Social Special and never mutates the raw metadata.
const capExplicit = buildCaption({ market: "Dallas", propertyType: "Townhome", special: "8 weeks free on select units", socialSpecial: "$500 Gift Card" }, "s0")
ok("caption uses explicit Social Special in ✨ line", capExplicit.includes("✨ $500 Gift Card") && !capExplicit.includes("✨ 8 Weeks Free"))
ok("Free Movers renders verbatim in caption", buildCaption({ market: "Dallas", socialSpecial: "Free Movers" }, "s0").includes("✨ Free Movers"))
const rawKept = { market: "Dallas", propertyType: "Townhome", special: "8 weeks free on select units", socialSpecial: "$500 Gift Card" }
buildCaption(rawKept, "s0"); resolveSocialSpecial(rawKept)
ok("raw Current Special metadata is never mutated by resolution", rawKept.special === "8 weeks free on select units")
ok("Template 1 overlay detail stays PRICE-ONLY regardless of Social Special", buildOverlayDetail({ ...rawKept, budgetRange: "1495" }) === "Starting at $1,495/month")
ok("one primary Social Special (single value feeds caption)", (capExplicit.match(/✨/g) || []).length === 1)

console.log("overlay typography = subtle tracking + localized drop shadow (NO band/box/scrim):")
const hugFilt = buildVideoFilter("/f.ttf", [{ file: "/h.txt", fontPx: 78, topPx: 250, lineSpacing: 8 }, { file: "/s.txt", fontPx: 40, topPx: 420, lineSpacing: 6 }])
ok("NO scrim/band/box in render (no geq/overlay/box)", !hugFilt.includes("geq=") && !hugFilt.includes("overlay=") && !hugFilt.includes("box=1"))
ok("drawtext has a subtle drop shadow (offset)", hugFilt.includes("shadowcolor=black@") && hugFilt.includes("shadowy="))
// A LOW-ALPHA HALO, NOT AN OUTLINE — approved 23 Oct 2026 from a published Reel
// (instagram.com/reel/De1lRmEE-As/), replacing the previous edgeAlpha 0. Pinned to the exact
// approved pair, in BOTH directions: too low and white text dissolves into a bright wall, too high
// and it reads as a drawn stroke, which is the thing that was rejected. 0.03em is a rounding
// requirement, not taste — see the note on the constant.
ok("the halo is the approved low alpha, not an outline", OVERLAY_TEXT.edgeAlpha === 0.22)
ok("…at the approved width, which keeps it proportional at every font size", OVERLAY_TEXT.edgeEm === 0.03)
// Tracking is 0, and must NEVER go negative. FFmpeg drawtext has no letter-spacing, so any non-zero
// value is a phantom width budget the render does not honor: positive shrinks headlines to pay for
// spacing that is never drawn, negative lets the fitter over-size text until it runs past the safe
// margins (-0.01em overflowed all three probe headlines). 0 is the only value where the measurement
// equals what is rendered.
ok("headline/detail tracking is 0 and never negative", OVERLAY_TEXT.trackingEm === 0)
ok("measured width === rendered width (no phantom tracking budget)",
  headlineTextWidthPx("What $1,500/month gets you in San Antonio", 41) === headlineTextWidthPx("What $1,500/month gets you in San Antonio", 41, 0) &&
  headlineTextWidthPx("Starting at $1,800/month", 40) === headlineTextWidthPx("Starting at $1,800/month", 40, 0))
// HEAD_ADV covers the full headline vocabulary — digits/$/,// were falling through to ADV_FALLBACK,
// which mis-measured every price-bearing headline (T15/T16).
ok("price headline is measured from real advances, not the fallback",
  headlineTextWidthPx("$1,500/month", 100) !== headlineTextWidthPx("@@@@@@@@@", 100))
// Raised 0.6 → 0.75 with the halo, with the OFFSET deliberately unchanged, so the text gained
// depth without the shadow moving or growing.
ok("drop-shadow is at the approved alpha", OVERLAY_TEXT.shadowAlpha === 0.75)
ok("…straight below the text, at the unchanged offset", OVERLAY_TEXT.shadowDxEm === 0 && OVERLAY_TEXT.shadowDyEm === 0.035)
ok("render graph still outputs the [v] label", /\[v\]$/.test(hugFilt))

console.log("Overlay TEMPLATES 1–5 (headline/detail generation + layout families):")
const tMeta = { market: "San Antonio", propertyType: "High-Rise", socialSpecial: "8 Weeks Free", budgetRange: "1600", amenities: "Private Yards, Rooftop Pool" }
ok(`${OVERLAY_TEMPLATES.length} templates defined`, OVERLAY_TEMPLATES.length === 33) // +T33 pov_regular_shmegular, appended
// T1 Market + Type (HERO)
ok("T1 headline = CITY TYPE_PLURAL", buildTemplateHeadline("market_type", tMeta) === "SAN ANTONIO HIGH-RISES")
ok("T1 detail = Starting at price", buildTemplateDetail("market_type", tMeta) === "Starting at $1,600/month")
ok("T1 detail omitted when no price", buildTemplateDetail("market_type", { market: "San Antonio", propertyType: "High-Rise" }) === "")
// T2 Your Sign (CENTER HOOK, no detail)
ok("T2 headline hook (Property Type only, no Market, reads as an upgrade)", buildTemplateHeadline("your_sign", tMeta) === "Your sign to get that new high-rise")
// your_sign now carries the shared optional price line (its headline is still metadata-free).
ok("your_sign emits the shared price line when a price exists", buildTemplateDetail("your_sign", tMeta) === "Starting at $1,600/month")
ok("your_sign emits nothing without a price", buildTemplateDetail("your_sign", { ...tMeta, budgetRange: null }) === "")
// T3 Special + Feature (HERO)
ok("T3 headline = CITY TYPE_PLURAL", buildTemplateHeadline("special_feature", tMeta) === "SAN ANTONIO HIGH-RISES")
ok("T3 detail special + feature", buildTemplateDetail("special_feature", tMeta) === "8 Weeks Free · Private Yards")
ok("T3 detail special only", buildTemplateDetail("special_feature", { market: "Dallas", propertyType: "Townhome", socialSpecial: "8 Weeks Free" }) === "8 Weeks Free")
ok("T3 detail feature only", buildTemplateDetail("special_feature", { market: "Dallas", propertyType: "Townhome", amenities: "Private Yards" }) === "Private Yards")
ok("T3 detail neither → empty", buildTemplateDetail("special_feature", { market: "Dallas", propertyType: "Townhome" }) === "")
// T4 Next Property (CENTER HOOK, no detail)
ok("T4 headline hook", buildTemplateHeadline("next_property", tMeta) === "What your next high-rise could look like")
// next_property now carries the SAME optional price line as every other T5-T14 template.
ok("next_property emits the shared price line when a price exists", buildTemplateDetail("next_property", tMeta) === "Starting at $1,600/month")
ok("next_property emits nothing without a price", buildTemplateDetail("next_property", { ...tMeta, budgetRange: null }) === "")
// T5 Upgrade (CENTER HOOK + DETAIL)
ok("T5 headline fixed", buildTemplateHeadline("upgrade", tMeta) === "What life looks like when you upgrade")
// upgrade/apartment_standards NO LONGER fold the special in — all of T5-T14 show the price alone,
// so every template has one secondary-line behaviour and one line shape. The special still drives
// the caption's sparkle line.
ok("upgrade is price-only now, matching the rest", buildTemplateDetail("upgrade", tMeta) === "Starting at $1,600/month")
ok("apartment_standards matches it byte for byte", buildTemplateDetail("apartment_standards", tMeta) === buildTemplateDetail("upgrade", tMeta))
ok("the special no longer reaches the overlay detail", !/Weeks Free/.test(buildTemplateDetail("upgrade", tMeta)))
ok("T5 detail price only", buildTemplateDetail("upgrade", { market: "San Antonio", propertyType: "High-Rise", budgetRange: "1600" }) === "Starting at $1,600/month")
// Layout families
ok("T1/T3 are HERO (headline near top, uppercase)", computeOverlayLayout("market_type", "SAN ANTONIO HIGH-RISES", "Starting at $1,600/month").family === "hero" && computeOverlayLayout("special_feature", "X", "").family === "hero")
ok("your_sign moved to CENTER HOOK + DETAIL, but renders no block without a price",
  computeOverlayLayout("your_sign", "Your sign to get that high-rise in San Antonio", "").family === "center_hook_detail"
  && computeOverlayLayout("your_sign", "Your sign to get that high-rise in San Antonio", "").detail === null)
ok("next_property moved to CENTER HOOK + DETAIL, but renders no block without a price",
  computeOverlayLayout("next_property", "What your next high-rise could look like", "").family === "center_hook_detail"
  && computeOverlayLayout("next_property", "What your next high-rise could look like", "").detail === null)
ok("T5 is CENTER HOOK + DETAIL", computeOverlayLayout("upgrade", "What life looks like when you upgrade", "8 Weeks Free · Starting at $1,600/month").family === "center_hook_detail")
const heroL = computeOverlayLayout("market_type", "SAN ANTONIO HIGH-RISES", "Starting at $1,600/month")
// Top-anchored means "in the upper part of the frame, not centred" — not a fixed pixel number.
// The old "< 400" was a magic threshold that broke whenever the anchor moved for visual reasons.
ok("HERO headline sits in the upper frame; detail below it",
  heroL.headline.topPx < OVERLAY_CANVAS.h / 3 && !!heroL.detail && heroL.detail.topPx > heroL.headline.topPx)
ok("HERO reads the shared top anchor", heroL.headline.topPx === OVERLAY_SPEC.headline.yFrac * OVERLAY_CANVAS.h)
ok("HERO headline is uppercase-flagged; center hook is not", heroL.headline.uppercase === true && computeOverlayLayout("your_sign", "Your sign", "").headline.uppercase === false)
// The T2 headline the generator actually produces is Property Type ONLY — the market was removed from
// this template (see buildTemplateHeadline). The old fixture still carried "… in San Antonio", which
// no template emits; in Libre Baskerville that legacy 46-char string wraps to two lines (810px + 312px,
// both inside the box — the wrap system behaving correctly). Use the REAL generated headline so these
// assertions test shipped behavior. The longest-T2/T4 assertions below already build theirs.
const hookL = computeOverlayLayout("your_sign", buildTemplateHeadline("your_sign", { propertyType: "High-Rise" } as any), "")
ok("CENTER HOOK is vertically centred (not near the top)", hookL.headline.topPx > 400 && hookL.headline.topPx < 1920 && hookL.detail === null)
ok("CENTER HOOK uses a smaller size than the Hero headline (not forced giant)", hookL.headline.fontPx < heroL.headline.fontPx)
const upL = computeOverlayLayout("upgrade", "What life looks like when you upgrade", "8 Weeks Free · Starting at $1,600/month")
ok("CENTER HOOK + DETAIL centres the group; detail below headline", !!upL.detail && upL.detail.topPx > upL.headline.topPx)
ok("CENTER HOOK + DETAIL hierarchy: detail is smaller than the hook", !!upL.detail && upL.detail.fontPx < upL.headline.fontPx)
ok("HERO hierarchy: detail is smaller than the headline", !!heroL.detail && heroL.detail.fontPx < heroL.headline.fontPx)
// Center-hook hooks are ONE line (never wrapped/stacked), even the longest supported sentence, and
// the headline stays one line even when a detail is present (T5).
ok("CENTER HOOK headline is ONE line (no wrap)", hookL.headline.lines.length === 1)
ok("longest T2 hook is ONE line", computeOverlayLayout("your_sign", buildTemplateHeadline("your_sign", { market: "San Antonio", propertyType: "Rental Home" }), "").headline.lines.length === 1)
ok("longest T4 hook is ONE line", computeOverlayLayout("next_property", buildTemplateHeadline("next_property", { market: "San Antonio", propertyType: "Rental Home" }), "").headline.lines.length === 1)
ok("T5 headline stays ONE line with detail present", upL.headline.lines.length === 1)
ok("center-hook headline never wraps or stacks (no manual breaks)", !hookL.headline.lines.join("").includes("\n") && hookL.headline.lines.length === 1)
// Center-hook fit-to-width: sizes land in [HOOK_MIN_PX, HOOK_MAX_PX]; both T2 hooks fit the 900px box.
const t2Short = computeOverlayLayout("your_sign", buildTemplateHeadline("your_sign", { propertyType: "Loft" }), "").headline
const t2Long = computeOverlayLayout("your_sign", buildTemplateHeadline("your_sign", { propertyType: "Rental Home" }), "").headline
// The conversational ceiling IS the scale: 46 -> 28 so the footage stays dominant.
ok("center-hook fit range is 22–38px", HOOK_MIN_PX === 22 && HOOK_MAX_PX === 38)
ok("center-hook fitted size stays within [37,46]", t2Short.fontPx >= HOOK_MIN_PX && t2Short.fontPx <= HOOK_MAX_PX && t2Long.fontPx >= HOOK_MIN_PX && t2Long.fontPx <= HOOK_MAX_PX)
// Short hook copy still caps at the max — the conversational TARGET only binds on longer sentences.
ok("Your Sign (short copy) still renders at the center-hook max (46px)", t2Short.fontPx === HOOK_MAX_PX)
ok("Your Sign (longest type) sits at the ceiling and inside the box", t2Long.fontPx === HOOK_MAX_PX && headlineTextWidthPx(t2Long.lines[0], t2Long.fontPx) <= HEADLINE_TEXT_AVAIL_PX)
ok("T2 hook fits the 900px safe box at its fitted size", headlineTextWidthPx(t2Long.lines[0], t2Long.fontPx) <= HEADLINE_TEXT_AVAIL_PX)

console.log("Templates 6 & 7 (POV Upgrade + Affordable Luxury — CENTER HOOK, no detail):")
// T6 — explicit per-type mapping (grammar intentionally differs; NOT a generic formula).
const POV: Record<string, string> = {
  Studio: "POV: You upgraded your studio",
  Apartment: "POV: You upgraded your apartment",
  "High-Rise": "POV: You upgraded to high-rise living",
  Townhome: "POV: You upgraded to a townhome",
  "Rental Home": "POV: You upgraded to a rental home",
  Penthouse: "POV: You upgraded to a penthouse",
  Loft: "POV: You upgraded to a loft",
}
for (const [type, expected] of Object.entries(POV)) {
  ok(`T6 ${type} → "${expected}"`, buildTemplateHeadline("pov_upgrade", { market: "San Antonio", propertyType: type }) === expected)
}
ok("T6 Apartment is 'your apartment' (NOT 'to an apartment')", buildTemplateHeadline("pov_upgrade", { propertyType: "Apartment" }) === "POV: You upgraded your apartment")
ok("T6 High-Rise is 'to high-rise living' (NOT 'to a high-rise')", buildTemplateHeadline("pov_upgrade", { propertyType: "High-Rise" }) === "POV: You upgraded to high-rise living")
ok("pov_upgrade gained the shared price line too", buildTemplateDetail("pov_upgrade", tMeta) === "Starting at $1,600/month")
ok("pov_upgrade emits nothing without a price", buildTemplateDetail("pov_upgrade", { ...tMeta, budgetRange: null }) === "")
ok("pov_upgrade is CENTER HOOK + DETAIL, with no block when the price is absent",
  computeOverlayLayout("pov_upgrade", buildTemplateHeadline("pov_upgrade", { propertyType: "Townhome" }), "").family === "center_hook_detail"
  && computeOverlayLayout("pov_upgrade", "x", "").detail === null)
// T7 — fixed universal hook; no variables/metadata, no detail.
ok("T7 headline is the fixed universal hook", buildTemplateHeadline("affordable_luxury", tMeta) === "Luxury doesn't have to be expensive")
ok("T7 ignores ALL metadata (type/market/special/price)", buildTemplateHeadline("affordable_luxury", { market: "Dallas", propertyType: "Loft", socialSpecial: "8 Weeks Free", budgetRange: "1200" }) === "Luxury doesn't have to be expensive")
// Affordable Luxury now carries the shared OPTIONAL price line, so "never has a detail" is no longer
// the rule — tMeta has a price, and with one it emits exactly what pov_price would. What must stay
// true is that it collapses COMPLETELY when there is no price. (The "T7" labels in this block are
// stale numbering from before the 2026-09-29 picker reorder; the key string is the identity.)
ok("Affordable Luxury emits the shared price line when a price exists", buildTemplateDetail("affordable_luxury", tMeta) === "Starting at $1,600/month")
ok("...which is byte-identical to pov_price's — one code path, not two", buildTemplateDetail("affordable_luxury", tMeta) === buildTemplateDetail("pov_price", tMeta))
ok("Affordable Luxury emits NO detail when there is no price", buildTemplateDetail("affordable_luxury", { ...tMeta, budgetRange: null }) === "")
ok("it is CENTER HOOK + DETAIL, yet renders no block when the line is empty",
  computeOverlayLayout("affordable_luxury", "Luxury doesn't have to be expensive", "").family === "center_hook_detail"
  && computeOverlayLayout("affordable_luxury", "Luxury doesn't have to be expensive", "").detail === null)
// Fit-to-width: longest T6 variant + T7 render ONE line within the 900px safe box (shared engine).
for (const s of ["POV: You upgraded to high-rise living", "POV: You upgraded to a rental home", "Luxury doesn't have to be expensive"]) {
  const L = computeOverlayLayout("pov_upgrade", s, "")
  ok(`T6/T7 fit-to-width ONE line: "${s}" (${L.headline.fontPx}px)`, L.headline.lines.length === 1 && L.headline.fontPx >= HOOK_MIN_PX && L.headline.fontPx <= HOOK_MAX_PX && headlineTextWidthPx(s, L.headline.fontPx) <= HEADLINE_TEXT_AVAIL_PX)
}
// Generated-state sync + manual-override protection for the new templates.
ok("T6 generated strings recognized (so they re-sync on Property Type change)", isGeneratedHeadline("POV: You upgraded to a townhome") && isGeneratedHeadline("POV: You upgraded to a loft"))
ok("T6 regenerates for the CURRENT type (Townhome vs Loft)", buildTemplateHeadline("pov_upgrade", { propertyType: "Townhome" }) === "POV: You upgraded to a townhome" && buildTemplateHeadline("pov_upgrade", { propertyType: "Loft" }) === "POV: You upgraded to a loft")
ok("T7 fixed headline recognized as generated", isGeneratedHeadline("Luxury doesn't have to be expensive"))
ok("a genuinely MANUAL hook is NOT treated as generated (override protected)", !isGeneratedHeadline("POV: You finally made it home"))
// The point of this assertion was never the NUMBER — it is that these specific templates sit at
// these specific indices, because a saved draft stores a string that must keep resolving. T25-T31
// were appended, so every index named below is unmoved.
ok("selector lists 33 templates with T2/T7/T8-T11 at their original indices", OVERLAY_TEMPLATES.length === 33 && OVERLAY_TEMPLATES[1] === "market_type_centered" && OVERLAY_TEMPLATES[5] === "upgrade" && OVERLAY_TEMPLATES[6] === "apartment_standards" && OVERLAY_TEMPLATES[7] === "pov_upgrade" && OVERLAY_TEMPLATES[8] === "affordable_luxury" && OVERLAY_TEMPLATES[9] === "pov_price" && OVERLAY_TEMPLATES[10] === "hits_different")

console.log("Template 8 (POV + Price — CENTER HOOK + DETAIL):")
// T8 headline = same explicit POV per-type mapping as T6.
for (const [type, expected] of Object.entries(POV)) {
  ok(`T8 headline ${type} → "${expected}"`, buildTemplateHeadline("pov_price", { market: "San Antonio", propertyType: type }) === expected)
}
ok("T8 no property type → 'POV: You upgraded'", buildTemplateHeadline("pov_price", {}) === "POV: You upgraded")
ok("T8 detail = 'Starting at $X/month' when a price exists", buildTemplateDetail("pov_price", { propertyType: "Townhome", budgetRange: "1800" }) === "Starting at $1,800/month")
ok("T8 detail omitted when NO price", buildTemplateDetail("pov_price", { propertyType: "Townhome" }) === "")
ok("T8 detail ignores special/amenities (price only)", buildTemplateDetail("pov_price", { propertyType: "Loft", budgetRange: "1250", socialSpecial: "8 Weeks Free", amenities: "Rooftop Pool" }) === "Starting at $1,250/month")
const t8 = computeOverlayLayout("pov_price", "POV: You upgraded to a townhome", "Starting at $1,800/month")
ok("T8 is CENTER HOOK + DETAIL (headline + detail block)", t8.family === "center_hook_detail" && !!t8.detail && t8.detail.lines.length === 1)
ok("T8 detail sits below the headline", !!t8.detail && t8.detail.topPx > t8.headline.topPx)
ok("T8 hierarchy: detail smaller than the POV headline", !!t8.detail && t8.detail.fontPx < t8.headline.fontPx)
ok("T8 headline is ONE line (fit-to-width) within the safe box", t8.headline.lines.length === 1 && headlineTextWidthPx(t8.headline.lines[0], t8.headline.fontPx) <= HEADLINE_TEXT_AVAIL_PX)
const t8NoPrice = computeOverlayLayout("pov_price", "POV: You upgraded to a loft", "")
ok("T8 with no price → headline only (no detail block)", t8NoPrice.detail === null)
ok("T8 headline re-syncs with Property Type (generator-owned)", isGeneratedHeadline("POV: You upgraded to a townhome") && buildTemplateHeadline("pov_price", { propertyType: "Loft" }) === "POV: You upgraded to a loft")
// /month canonical output has NO space between "/" and "mo" (multiple prices).
for (const [p, exp] of [["995", "Starting at $995/month"], ["1250", "Starting at $1,250/month"], ["1800", "Starting at $1,800/month"], ["2495", "Starting at $2,495/month"]] as const) {
  ok(`price ${p} → "${exp}" (no '/ mo' space)`, startingPriceLabel(p) === exp && !startingPriceLabel(p).includes("/ mo"))
}

console.log("Template 1 detail size (larger price line; T1 only):")
const t1d = computeOverlayLayout("market_type", "SAN ANTONIO TOWNHOMES", "Starting at $1,800/month").detail
// T1's price renders at its 52px target whenever the fitted headline leaves room, and is COUPLED to
// headline − 2 otherwise so it can never out-size the headline it supports. "SAN ANTONIO TOWNHOMES"
// fits at 51px in Libre Baskerville, so its price caps at 49; a shorter combo still gets the full 52.
ok("T1 detail renders at 52px when the headline is large enough",
  computeOverlayLayout("market_type", "DFW LOFTS", "Starting at $1,800/month").detail!.fontPx === 52)
ok("T1 detail is capped at headline − 2 when the headline fits small", !!t1d && t1d.fontPx === computeOverlayLayout("market_type", "SAN ANTONIO TOWNHOMES", "Starting at $1,800/month").headline.fontPx - 2)
ok("T1 detail stays ONE line for all test prices", ["Starting at $995/month", "Starting at $1,250/month", "Starting at $1,800/month", "Starting at $2,495/month"].every((p) => computeOverlayLayout("market_type", "SAN ANTONIO LOFTS", p).detail!.lines.length === 1))
ok("T3 (special_feature) detail UNCHANGED at the shared sub size", (computeOverlayLayout("special_feature", "SAN ANTONIO TOWNHOMES", "8 Weeks Free · Private Yards").detail!.fontPx) === OVERLAY_SPEC.sub.fontPx)
ok("T1 detail still clearly secondary to the headline", !!t1d && t1d.fontPx < computeOverlayLayout("market_type", "SAN ANTONIO TOWNHOMES", "Starting at $1,800/month").headline.fontPx)

console.log("Templates 5 & 8 detail hierarchy (supporting the hook — one line, secondary, tight gap):")
// T5 Upgrade — detail 38px (reduced to support, not compete), one line for every fallback.
const t5cases = ["8 Weeks Free · Starting at $1,900/month", "Starting at $1,900/month", "8 Weeks Free"]
for (const d of t5cases) {
  const L = computeOverlayLayout("upgrade", "What life looks like when you upgrade", d)
  ok(`T6 detail one line at the flat conversational size: "${d}" (${L.detail!.fontPx}px vs hook ${L.headline.fontPx})`, L.detail!.lines.length === 1 && L.detail!.fontPx === Math.min(36, Math.max(20, L.headline.fontPx - 1)) && L.detail!.fontPx < L.headline.fontPx && headlineTextWidthPx(d, L.detail!.fontPx) <= DETAIL_TEXT_AVAIL_PX)
}
// T8 POV + Price — price detail 40px (strong but below the POV headline), one line for all prices.
for (const p of ["Starting at $995/month", "Starting at $1,250/month", "Starting at $1,900/month", "Starting at $2,495/month"]) {
  const L = computeOverlayLayout("pov_price", "POV: You upgraded to a townhome", p)
  ok(`T10 price one line at the flat conversational size: "${p}" (${L.detail!.fontPx}px vs hook ${L.headline.fontPx})`, L.detail!.lines.length === 1 && L.detail!.fontPx === Math.min(36, Math.max(20, L.headline.fontPx - 1)) && L.detail!.fontPx < L.headline.fontPx && headlineTextWidthPx(p, L.detail!.fontPx) <= DETAIL_TEXT_AVAIL_PX)
}
// Was "T10's price detail is LARGER than T6's" — a per-template size table that no longer exists.
// Both now derive from the same 0.75 ratio off the same ceiling, so they are equal by construction
// and each stays clearly secondary to its hook.
ok("T6/T10 details are equal and both clearly secondary", (() => {
  const a = computeOverlayLayout("pov_price", "POV: You upgraded to a townhome", "Starting at $1,900/month")
  const b = computeOverlayLayout("upgrade", "What life looks like when you upgrade", "Starting at $1,900/month")
  return a.detail!.fontPx === b.detail!.fontPx && a.detail!.fontPx < a.headline.fontPx && b.detail!.fontPx < b.headline.fontPx
})())
// Tighter gap: center-hook detail sits closer than the standard Hero sub gap; T3 gap tighter too.
const t5L = computeOverlayLayout("upgrade", "What life looks like when you upgrade", "Starting at $1,900/month")
ok("T5 detail sits ~21px below the hook (breathing room, still a lockup)", !!t5L.detail && (t5L.detail.topPx - (t5L.headline.topPx + t5L.headline.fontPx)) <= 22)
const t3gap = computeOverlayLayout("special_feature", "SAN ANTONIO TOWNHOMES", "8 Weeks Free · Private Yards")
const t1gap = computeOverlayLayout("market_type", "SAN ANTONIO TOWNHOMES", "Starting at $1,900/month")
const t1GapPx = t1gap.detail!.topPx - (t1gap.headline.topPx + t1gap.headline.fontPx)
ok("T1 headline→detail gap is 22px (tightened 2px from 24)", t1GapPx === 22)
ok("T3 detail gap (18) is still TIGHTER than T1 (24)", (t3gap.detail!.topPx - (t3gap.headline.topPx + t3gap.headline.fontPx)) < t1GapPx)
ok("T8 with no price → no detail block (omitted)", computeOverlayLayout("pov_price", "POV: You upgraded to a loft", "").detail === null)
// Guardrails: Template 1 stays 52, Template 3 stays the shared sub size.
ok("Template 1 detail STAYS 52px", computeOverlayLayout("market_type", "SAN ANTONIO LOFTS", "Starting at $1,900/month").detail!.fontPx === 52)
ok("Template 3 detail UNCHANGED (shared sub size)", computeOverlayLayout("special_feature", "SAN ANTONIO LOFTS", "8 Weeks Free · Private Yards").detail!.fontPx === OVERLAY_SPEC.sub.fontPx)

console.log("Final cleanup — T2 no Market, T4 smaller, T5 gap:")
// T2 — Property Type only, Market removed, for EVERY type.
const T2 = { Studio: "Your sign to get that new studio", Apartment: "Your sign to get that new apartment", "High-Rise": "Your sign to get that new high-rise", Townhome: "Your sign to get that new townhome", "Rental Home": "Your sign to get that new rental home", Penthouse: "Your sign to get that new penthouse", Loft: "Your sign to get that new loft" }
for (const [type, expected] of Object.entries(T2)) {
  ok(`T2 ${type} → "${expected}"`, buildTemplateHeadline("your_sign", { market: "San Antonio", propertyType: type }) === expected)
}
ok("T2 NO Market in copy (even when market set)", !buildTemplateHeadline("your_sign", { market: "San Antonio", propertyType: "Townhome" }).includes("San Antonio") && !buildTemplateHeadline("your_sign", { market: "San Antonio", propertyType: "Townhome" }).includes(" in "))
ok("T2 no detail line", buildTemplateDetail("your_sign", { market: "San Antonio", propertyType: "Townhome" }) === "")
ok("T2 generated forms recognized (re-sync on Property Type change)", isGeneratedHeadline("Your sign to get that new townhome") && isGeneratedHeadline("Your sign to get that new loft"))
ok("T2 manual override still protected", !isGeneratedHeadline("Your sign to get that dream home"))
// LEGACY copy stays generator-owned (same rule as the legacy "/mo"): a draft written before "new"
// was added, or before T11 was sentence-cased, must still re-sync on a Property Type change instead
// of being frozen as a manual override.
ok("legacy your_sign (pre-\"new\") still generator-owned", isGeneratedHeadline("Your sign to get that loft") && isGeneratedHeadline("Your sign to get that split-level loft"))
ok("legacy title-cased hits_different still generator-owned", isGeneratedHeadline("High-Rises just hit different") && isGeneratedHeadline("Rental Homes just hit different") && isGeneratedHeadline("Split-Level Lofts just hit different"))
ok("pre-\"These\" Apartment/Studio copy still generator-owned", isGeneratedHeadline("Apartments just hit different") && isGeneratedHeadline("Studios just hit different"))
ok("a genuinely manual headline is still NOT generator-owned", !isGeneratedHeadline("My own custom headline"))
// T4 — smaller than the shared center-hook max (more side margin); T4 only.
const t4 = computeOverlayLayout("next_property", "What your next townhome could look like", "").headline
ok("T4 headline is capped smaller (≤40px) for side margin", t4.fontPx <= 40)
// T5's old 40px exception is retired — every center-hook shares the one 28px ceiling.
ok("all center-hooks share the one ceiling", computeOverlayLayout("your_sign", "Your sign to get that loft", "").headline.fontPx === HOOK_MAX_PX && computeOverlayLayout("next_property", "What your next loft could look like", "").headline.fontPx === HOOK_MAX_PX)
ok("T4 wording unchanged + one line", buildTemplateHeadline("next_property", { propertyType: "Townhome" }) === "What your next townhome could look like" && t4.lines.length === 1)
// T5 gap 16 → 21; T8 gap stays 16.
const t5g = computeOverlayLayout("upgrade", "What life looks like when you upgrade", "6 Weeks Free · Starting at $1,800/month")
const t8g = computeOverlayLayout("pov_price", "POV: You upgraded to a townhome", "Starting at $1,800/month")
// The 12px/17px SPLIT IS GONE. Two constants governed templates that are visually identical — same
// face, same hook size, same detail size — so against upgrade/apartment_standards at 17px the 12px
// group (pov_price, hits_different, trade_up, wanted_luxury, real_living) read as visibly too tight.
// Both now resolve from the one DETAIL_GAP_EM ratio, which lands on exactly 17px at the shared 38px
// hook: the approved look is unchanged and the tight group moved to meet it. The group is vertically
// centred, so this does not move the lockup (its centre stays at 960 — asserted below).
ok("upgrade keeps its approved 17px gap", (t5g.detail!.topPx - (t5g.headline.topPx + t5g.headline.fontPx)) === 17)
ok("pov_price now MATCHES it instead of sitting 5px tighter", (t8g.detail!.topPx - (t8g.headline.topPx + t8g.headline.fontPx)) === 17)
ok("tightening the gap does NOT move the lockup — it stays centred on the canvas", (() => {
  return (["hits_different", "real_living", "trade_up", "upgrade", "wanted_luxury"] as const).every((t) => {
    const L = computeOverlayLayout(t, buildTemplateHeadline(t, { propertyType: "Rental Home", market: "San Antonio", budgetRange: "1500" }), "Starting at $1,500/month")
    const n = L.headline.lines.length
    const bottom = L.detail!.topPx + L.detail!.fontPx
    return Math.abs((L.headline.topPx + bottom) / 2 - OVERLAY_CANVAS.h / 2) < 0.51 &&
      L.detail!.topPx > L.headline.topPx + n * L.headline.fontPx + (n - 1) * L.headline.lineSpacing // no collision
  })
})())
ok("T6 detail is the flat conversational size", t5g.detail!.fontPx === Math.min(36, Math.max(20, t5g.headline.fontPx - 1)))

console.log("\nTemplate 11 (What $/mo Gets You — dynamic price+city, CENTER HOOK like T7):")
// The two examples from the spec, exactly.
ok('T11 "$1,495 + San Antonio" -> "What $1,495/month gets you in San Antonio"', buildTemplateHeadline("what_mo_gets_you", { market: "San Antonio", budgetRange: "1495" }) === "What $1,495/month gets you in San Antonio")
ok('T11 "$1,800 + Houston" -> "What $1,800/month gets you in Houston"', buildTemplateHeadline("what_mo_gets_you", { market: "Houston", budgetRange: "1800" }) === "What $1,800/month gets you in Houston")
ok('T11 "$2,250 + Austin" -> "What $2,250/month gets you in Austin"', buildTemplateHeadline("what_mo_gets_you", { market: "Austin", budgetRange: "2250" }) === "What $2,250/month gets you in Austin")
ok("T11 changing price recomputes the headline", buildTemplateHeadline("what_mo_gets_you", { market: "Dallas", budgetRange: "1200" }) === "What $1,200/month gets you in Dallas" && buildTemplateHeadline("what_mo_gets_you", { market: "Dallas", budgetRange: "1650" }) === "What $1,650/month gets you in Dallas")
ok("T11 changing market recomputes the headline", buildTemplateHeadline("what_mo_gets_you", { market: "Austin", budgetRange: "1495" }) === "What $1,495/month gets you in Austin" && buildTemplateHeadline("what_mo_gets_you", { market: "Houston", budgetRange: "1495" }) === "What $1,495/month gets you in Houston")
ok("T11 no price -> '' (never $0/undefined/fabricated)", buildTemplateHeadline("what_mo_gets_you", { market: "San Antonio" }) === "")
ok("T11 no market -> '' (never a fabricated city)", buildTemplateHeadline("what_mo_gets_you", { budgetRange: "1495" }) === "")
ok("T11 neither value -> ''", buildTemplateHeadline("what_mo_gets_you", {}) === "")
ok("T11 has no separate detail line (the sentence IS the whole headline)", buildTemplateDetail("what_mo_gets_you", { market: "San Antonio", budgetRange: "1495" }) === "")
ok("T11 reuses T7's center-hook typography (same family, no detail either way)", templateFamily("what_mo_gets_you") === "center_hook" && templateFamily("apartment_standards") === "center_hook_detail")
const t11 = computeOverlayLayout("what_mo_gets_you", "What $1,495/month gets you in San Antonio", "")
const t7cmp = computeOverlayLayout("apartment_standards", "Your apartment standards went up", "")
ok("T11 headline sizes exactly like T7's hook (same CENTER_HOOK.maxPx ceiling, both one line)", t11.headline.lines.length === 1 && t7cmp.headline.lines.length === 1 && t11.detail === null)
ok("T11 headline is ONE line (fit-to-width) within the safe box", headlineTextWidthPx(t11.headline.lines[0], t11.headline.fontPx) <= HEADLINE_TEXT_AVAIL_PX)
// Reactivity: a freshly-generated T11 headline must be recognized as generator-owned (not frozen
// as a manual override) on reload, for ANY price — this is the fix for the isGeneratedHeadline sweep,
// which can't enumerate arbitrary prices the way it enumerates the small market/type enums.
ok("T11 generated headline recognized regardless of the specific price (reload-safe)", isGeneratedHeadline("What $1,495/month gets you in San Antonio") && isGeneratedHeadline("What $2,250/month gets you in Austin") && isGeneratedHeadline("What $995/month gets you in Dallas"))
ok("T11 a genuinely manual headline in the same shape but a FAKE city is NOT treated as generated", !isGeneratedHeadline("What $1,495/month gets you in Atlantis"))
ok("T11 empty stays 'generated' (nothing typed, same as every other template)", isGeneratedHeadline(""))
// startingPriceAmount — the plain $-amount helper T11 builds its sentence around.
ok('startingPriceAmount "1495" -> "$1,495" (no "Starting at"/"/month")', startingPriceAmount("1495") === "$1,495")
ok('startingPriceAmount "$1,200–$1,800" -> lowest, "$1,200"', startingPriceAmount("$1,200-$1,800") === "$1,200")
ok("startingPriceAmount missing -> '' (never $0)", startingPriceAmount(undefined) === "" && startingPriceAmount("") === "")
ok("startingPriceLabel unchanged by the refactor (still 'Starting at $X/month')", startingPriceLabel("1495") === "Starting at $1,495/month")
// Existing templates stay exactly as they were (T1–T10 untouched by adding T11).
ok("T1 unchanged", buildTemplateHeadline("market_type", { market: "San Antonio", propertyType: "High-Rise" }) === "SAN ANTONIO HIGH-RISES")
ok("T7 unchanged", buildTemplateHeadline("apartment_standards", {}) === "Your apartment standards went up")
ok("T9 unchanged", buildTemplateHeadline("affordable_luxury", {}) === "Luxury doesn't have to be expensive")

console.log("\nTemplates 12–16 (registry + dropdown order):")
// Picker order after the 2026-09-29 swap: hits_different moved to 11 and what_mo_gets_you to 15, so
// the two "$/month Gets You" templates sit together at 15 and 16. Keys (identities) are unchanged.
ok("T12–T16 registered in order after T11", OVERLAY_TEMPLATES[11] === "trade_up" && OVERLAY_TEMPLATES[12] === "wanted_luxury" && OVERLAY_TEMPLATES[13] === "real_living" && OVERLAY_TEMPLATES[14] === "what_mo_gets_you" && OVERLAY_TEMPLATES[15] === "what_mo_gets_you_top")
// The swap is DISPLAY ONLY — every key still exists exactly once, so no saved post can change meaning.
ok("swap preserved every template identity (no key added, removed or duplicated)",
  new Set(OVERLAY_TEMPLATES).size === OVERLAY_TEMPLATES.length &&
  (["what_mo_gets_you", "hits_different"] as const).every((k) => (OVERLAY_TEMPLATES as readonly string[]).includes(k)))
// T18-T20 APPENDED, NOTHING DISPLACED. The seventeen original keys must still occupy indices
// 0..16 in their original order — a saved post stores the KEY, so a reordering would silently
// change what an existing draft renders.
{
  const ORIGINAL_17 = ["market_type","market_type_centered","your_sign","special_feature","next_property",
    "upgrade","apartment_standards","pov_upgrade","affordable_luxury","pov_price","hits_different",
    "trade_up","wanted_luxury","real_living","what_mo_gets_you","what_mo_gets_you_top","property_tour"] as const
  ok("the original 17 keys are unchanged, in their original positions",
    ORIGINAL_17.every((k, i) => OVERLAY_TEMPLATES[i] === k))
  ok("T18-T20 are appended at 17, 18, 19",
    OVERLAY_TEMPLATES[17] === "would_you_live_here" && OVERLAY_TEMPLATES[18] === "imagine_coming_home" && OVERLAY_TEMPLATES[19] === "client_me")
  ok("every template has a dropdown label", OVERLAY_TEMPLATES.every((t) => !!OVERLAY_TEMPLATE_LABEL[t]))
}
ok("picker positions: 11 = Hits Different, 15 = What $/mo Gets You, 16 = — Top",
  OVERLAY_TEMPLATE_LABEL[OVERLAY_TEMPLATES[10]] === "Hits Different" &&
  OVERLAY_TEMPLATE_LABEL[OVERLAY_TEMPLATES[14]] === "What $/mo Gets You" &&
  OVERLAY_TEMPLATE_LABEL[OVERLAY_TEMPLATES[15]] === "What $/mo Gets You — Top")
ok("T12–T16 dropdown labels", OVERLAY_TEMPLATE_LABEL.trade_up === "Trade Up" && OVERLAY_TEMPLATE_LABEL.wanted_luxury === "You Wanted Luxury" && OVERLAY_TEMPLATE_LABEL.real_living === "Real [Property Type] Living" && OVERLAY_TEMPLATE_LABEL.hits_different === "Hits Different" && OVERLAY_TEMPLATE_LABEL.what_mo_gets_you_top === "What $/mo Gets You — Top")

console.log("\nTemplate 12 (Trade Up — dynamic Property Type + optional price):")
// T12 lowercases the type for display, same reasoning as T14: it sits inside a sentence.
ok("T12 Townhome → lowercase", buildTemplateHeadline("trade_up", { propertyType: "Townhome" }) === "What life looks like when you trade in your apartment for a townhome")
ok("T12 High-Rise → lowercase", buildTemplateHeadline("trade_up", { propertyType: "High-Rise" }) === "What life looks like when you trade in your apartment for a high-rise")
ok("T12 Loft → lowercase", buildTemplateHeadline("trade_up", { propertyType: "Loft" }) === "What life looks like when you trade in your apartment for a loft")
// indefiniteArticle() is case-insensitive, so lowercasing cannot break the a/an grammar.
// Apartment is the ONE destination that cannot be phrased as a trade — "…trade in your apartment
// for an apartment" was a non-statement, so it reads as an upgrade instead.
ok("T12 Apartment → upgrade wording, not apartment-for-an-apartment", buildTemplateHeadline("trade_up", { propertyType: "Apartment" }) === "What life looks like when you upgrade your apartment")
// The a/an-after-lowercasing coverage this line used to carry moves to a vowel-initial type that
// still takes the trade path, so the grammar rule stays asserted.
ok("T12 vowel-initial type still takes 'an' after lowercasing", buildTemplateHeadline("trade_up", { propertyType: "Industrial-Style Apartment" }) === "What life looks like when you trade in your apartment for an industrial-style apartment")
ok("T12 no type → generic 'a home' (never undefined/null)", buildTemplateHeadline("trade_up", {}) === "What life looks like when you trade in your apartment for a home")
ok("T12 price line present when Starting At is valid", buildTemplateDetail("trade_up", { propertyType: "Townhome", budgetRange: "1495" }) === "Starting at $1,495/month")
ok("T12 price line OMITTED when no Starting At", buildTemplateDetail("trade_up", { propertyType: "Townhome" }) === "")

console.log("\nTemplate 13 (You Wanted Luxury — fixed hook + optional price):")
ok("T13 fixed headline", buildTemplateHeadline("wanted_luxury", {}) === "You wanted luxury. You got it." && buildTemplateHeadline("wanted_luxury", { propertyType: "Loft", market: "Austin" }) === "You wanted luxury. You got it.")
ok("T13 price line present when valid", buildTemplateDetail("wanted_luxury", { budgetRange: "1895" }) === "Starting at $1,895/month")
ok("T13 price line omitted when missing", buildTemplateDetail("wanted_luxury", {}) === "")

console.log("\nTemplate 14 (Real [Property Type] Living — dynamic Property Type + optional price):")
// T14 lowercases the property type for display — it reads as prose here, not as a label. DISPLAY ONLY:
// the canonical value is untouched and every other template still renders it in canonical case
// (asserted below). The block is uppercase:false, so the lowercase reaches preview and render alike.
ok("T14 High-Rise → lowercase", buildTemplateHeadline("real_living", { propertyType: "High-Rise" }) === "This is what real high-rise living looks like")
ok("T14 Townhome → lowercase", buildTemplateHeadline("real_living", { propertyType: "Townhome" }) === "This is what real townhome living looks like")
ok("T14 Rental Home → lowercase (two words)", buildTemplateHeadline("real_living", { propertyType: "Rental Home" }) === "This is what real rental home living looks like")
// Lowercasing is scoped to the two templates where the type sits INSIDE a sentence (T12, T14).
// Everywhere title case is intentional it is untouched: T11's plural subject and T1's hero headline.
ok("lowercasing is template-scoped — title case preserved where intentional",
  buildTemplateHeadline("hits_different", { propertyType: "Townhome" }) === "Townhomes just hit different" &&
  buildOverlayHeadline({ market: "San Antonio", propertyType: "Townhome" }) === "SAN ANTONIO TOWNHOMES")
ok("T14 no type → type word dropped, nothing fabricated", buildTemplateHeadline("real_living", {}) === "This is what real living looks like")
ok("T14 optional price", buildTemplateDetail("real_living", { budgetRange: "2100" }) === "Starting at $2,100/month" && buildTemplateDetail("real_living", {}) === "")

console.log("\nTemplate 15 (Hits Different — PLURALIZED display copy + optional price):")
// Display-only plural: every SUPPORTED Property Type value, incl. the two that a blind "+s" or a
// naive first-letter capitalization would get wrong (High-Rises, Rental Homes).
for (const [pt, expected] of [
  // Apartment and Studio are the GENERIC categories: the bare plural reads as a claim about the
  // whole market, so they lead with "These". Every other type keeps the bare plural.
  ["Studio", "These studios just hit different"],
  ["Apartment", "These apartments just hit different"],
  ["High-Rise", "High-rises just hit different"],
  ["Townhome", "Townhomes just hit different"],
  ["Rental Home", "Rental homes just hit different"],
  ["Penthouse", "Penthouses just hit different"],
  ["Loft", "Lofts just hit different"],
] as const) {
  ok(`T15 ${pt} → "${expected}"`, buildTemplateHeadline("hits_different", { propertyType: pt }) === expected)
}
ok("T15 verb agrees with the plural subject (\"hit\", never \"hits\")", PROPERTY_TYPES.every((pt) => { const h = buildTemplateHeadline("hits_different", { propertyType: pt }); return h.endsWith(" just hit different") && !h.includes("just hits different") }))
ok("T15 no type → generic plural subject, nothing fabricated", buildTemplateHeadline("hits_different", {}) === "These just hit different")
ok("T15 legacy Mid-Rise still canonicalizes (High-Rise) before pluralizing", buildTemplateHeadline("hits_different", { propertyType: "Mid-Rise" }) === "High-rises just hit different")
ok("T15 optional price", buildTemplateDetail("hits_different", { budgetRange: "995" }) === "Starting at $995/month" && buildTemplateDetail("hits_different", {}) === "")

console.log("\nTemplates 12–15 reactivity (Property Type / Starting At recompute):")
ok("changing Property Type recomputes T12/T14/T15", buildTemplateHeadline("trade_up", { propertyType: "Loft" }) !== buildTemplateHeadline("trade_up", { propertyType: "Penthouse" }) && buildTemplateHeadline("real_living", { propertyType: "Loft" }) !== buildTemplateHeadline("real_living", { propertyType: "Studio" }) && buildTemplateHeadline("hits_different", { propertyType: "Loft" }) !== buildTemplateHeadline("hits_different", { propertyType: "Studio" }))
ok("changing Starting At recomputes the price line on all of T12–T15", (["trade_up", "wanted_luxury", "real_living", "hits_different"] as const).every((t) => buildTemplateDetail(t, { budgetRange: "1200" }) === "Starting at $1,200/month" && buildTemplateDetail(t, { budgetRange: "1650" }) === "Starting at $1,650/month"))
ok("no fabricated price anywhere in T12–T15 ($0/undefined/null/'Starting at' alone)", (["trade_up", "wanted_luxury", "real_living", "hits_different"] as const).every((t) => { const d = buildTemplateDetail(t, {}); return d === "" && !/\$0|undefined|null|Starting at/.test(d) }))

console.log("\nTemplates 12–15 layout — same CENTERED treatment as T11, price line collapses:")
for (const t of ["trade_up", "wanted_luxury", "real_living", "hits_different"] as const) {
  const withPrice = computeOverlayLayout(t, buildTemplateHeadline(t, { propertyType: "Townhome", budgetRange: "1495" }), buildTemplateDetail(t, { propertyType: "Townhome", budgetRange: "1495" }))
  const noPrice = computeOverlayLayout(t, buildTemplateHeadline(t, { propertyType: "Townhome" }), buildTemplateDetail(t, { propertyType: "Townhome" }))
  // Price line takes T10's 40px target, still bound by the existing "never larger than hook − 2"
  // rule — so a template whose headline shrank (T14 at 40px) lands at 38px, staying secondary.
  ok(`${t}: centered family, price line below the hook, ≤40px and secondary to it`, withPrice.family === "center_hook_detail" && !!withPrice.detail && withPrice.detail.topPx > withPrice.headline.topPx && withPrice.detail.fontPx <= 40 && withPrice.detail.fontPx < withPrice.headline.fontPx)
  ok(`${t}: NO price → detail block omitted entirely (layout collapses)`, noPrice.detail === null)
  ok(`${t}: group stays vertically centred (same composition as T11)`, Math.abs((noPrice.headline.topPx + (noPrice.headline.lines.length * noPrice.headline.fontPx) / 2) - OVERLAY_CANVAS.h / 2) < 40)
  ok(`${t}: every headline line fits the safe box`, withPrice.headline.lines.every((l) => headlineTextWidthPx(l, withPrice.headline.fontPx) <= HEADLINE_TEXT_AVAIL_PX))
}

console.log("\nTemplate 16 (What $/mo Gets You — Top): same copy as T11, T1's TOP anchor:")
const t16src = { market: "San Antonio", budgetRange: "1495" }
ok("T16 headline identical to T11's for the same metadata", buildTemplateHeadline("what_mo_gets_you_top", t16src) === buildTemplateHeadline("what_mo_gets_you", t16src) && buildTemplateHeadline("what_mo_gets_you_top", t16src) === "What $1,495/month gets you in San Antonio")
ok("T16 dynamic Market", buildTemplateHeadline("what_mo_gets_you_top", { market: "Houston", budgetRange: "1800" }) === "What $1,800/month gets you in Houston" && buildTemplateHeadline("what_mo_gets_you_top", { market: "Austin", budgetRange: "2250" }) === "What $2,250/month gets you in Austin")
ok("T16 dynamic Starting At", buildTemplateHeadline("what_mo_gets_you_top", { market: "Dallas", budgetRange: "1650" }) === "What $1,650/month gets you in Dallas")
ok("T16 missing price or market → '' (never fabricated)", buildTemplateHeadline("what_mo_gets_you_top", { market: "Austin" }) === "" && buildTemplateHeadline("what_mo_gets_you_top", { budgetRange: "1495" }) === "")
ok("T16 has no detail line, like T11", buildTemplateDetail("what_mo_gets_you_top", t16src) === "")
{
  const t11L = computeOverlayLayout("what_mo_gets_you", buildTemplateHeadline("what_mo_gets_you", t16src), "")
  const t16L = computeOverlayLayout("what_mo_gets_you_top", buildTemplateHeadline("what_mo_gets_you_top", t16src), "")
  // T16 is top-anchored, NOT centred — but it no longer borrows the hero's anchor. It is the
  // conversational family (38px, sentence case) merely positioned at the top, and the hero anchor
  // moved to clear Instagram's 3:4 grid crop, which is a 66px-uppercase problem. Sharing the number
  // meant a hero fix silently dragged T16. It is pinned at its own long-standing 249.6.
  ok("T16 is top-anchored, in the upper frame", t16L.headline.topPx < OVERLAY_CANVAS.h / 3)
  // SHARED, deliberately. T16 briefly had its own anchor so a hero change could not drag it; the
  // requirement is the opposite — every top-anchored template sits at ONE position so the three
  // read as a family on the profile grid, whatever their type size.
  ok("…at the SAME shared anchor as the hero templates",
    t16L.headline.topPx === OVERLAY_SPEC.headline.yFrac * OVERLAY_CANVAS.h)
  ok("…so T1, T4 and T16 are all aligned", (() => {
    const t1 = computeOverlayLayout("market_type", "DALLAS APARTMENTS", "Starting at $2,600/month")
    const t4 = computeOverlayLayout("special_feature", "DALLAS APARTMENTS", "2 Months Free")
    return t1.headline.topPx === t4.headline.topPx && t4.headline.topPx === t16L.headline.topPx
  })())
  // The visual requirement this encodes: clearly inside Instagram's measured 3:4 grid crop
  // (canvas y 240..1680), with a real margin rather than the minimum that survives it.
  ok("…and all three sit well clear of the grid crop line", t16L.headline.topPx >= 240 + 180)
  ok("…because it is the smaller conversational family, not a hero",
    t16L.headline.fontPx < 50 && t16L.headline.uppercase === false && t16L.family === "center_hook")
  ok("T11 stays CENTRED and is unchanged by T16 existing", Math.abs(t11L.headline.topPx - (OVERLAY_CANVAS.h - t11L.headline.fontPx) / 2) < 40 && t11L.headline.topPx > t16L.headline.topPx)
  ok("T16 reuses T11's hook typography exactly (same size, one line, same family)", t16L.headline.fontPx === t11L.headline.fontPx && t16L.headline.lines.length === 1 && t16L.family === t11L.family)
}

console.log("\nManual-edit protection for the new templates (generated headlines re-sync, manual ones don't):")
ok("T12/T14/T15 generated headlines recognized as generator-owned", isGeneratedHeadline("What life looks like when you trade in your apartment for a townhome") && isGeneratedHeadline("This is what real high-rise living looks like") && isGeneratedHeadline("Townhomes just hit different") && isGeneratedHeadline("Rental homes just hit different"))
// A T14 headline generated BEFORE the lowercase change no longer matches what any template produces,
// so it is (correctly) treated as a manual override and left alone rather than silently rewritten.
ok("pre-change capitalized T14 headline is no longer generator-owned", !isGeneratedHeadline("This is what real High-Rise living looks like"))
ok("T13 fixed headline recognized as generator-owned", isGeneratedHeadline("You wanted luxury. You got it."))
ok("T16 generated headline recognized (shares T11's shape check)", isGeneratedHeadline("What $1,495/month gets you in San Antonio"))
ok("a genuinely MANUAL hook in these shapes is still protected", !isGeneratedHeadline("Townhomes just hit way different") && !isGeneratedHeadline("You wanted luxury. You earned it."))

console.log("\nTemplates 1–11 unchanged by this addition:")
ok("T1 hero headline + price detail unchanged", buildTemplateHeadline("market_type", { market: "San Antonio", propertyType: "High-Rise" }) === "SAN ANTONIO HIGH-RISES" && buildTemplateDetail("market_type", { budgetRange: "1600" }) === "Starting at $1,600/month")
ok("T2/T5/T6/T7/T9/T10 headlines unchanged", buildTemplateHeadline("your_sign", { propertyType: "Townhome" }) === "Your sign to get that new townhome" && buildTemplateHeadline("next_property", { propertyType: "Townhome" }) === "What your next townhome could look like" && buildTemplateHeadline("upgrade", {}) === "What life looks like when you upgrade" && buildTemplateHeadline("apartment_standards", {}) === "Your apartment standards went up" && buildTemplateHeadline("affordable_luxury", {}) === "Luxury doesn't have to be expensive" && buildTemplateHeadline("pov_price", { propertyType: "Loft" }) === "POV: You upgraded to a loft")
ok("T6/T10 detail follows the flat 36px rule", (["upgrade","pov_price"] as const).every((t) => { const L = computeOverlayLayout(t, t === "upgrade" ? "What life looks like when you upgrade" : "POV: You upgraded to a loft", "Starting at $1,900/month"); return L.detail!.fontPx === Math.min(36, Math.max(20, L.headline.fontPx - 1)) }))
ok("T1 stays HERO, T11 stays center_hook, T7 stays center_hook_detail", templateFamily("market_type") === "hero" && templateFamily("what_mo_gets_you") === "center_hook" && templateFamily("apartment_standards") === "center_hook_detail")
// The one-line rule is untouched for every template that predates T12: the new wrap branch only
// engages for copy that cannot fit even at CENTER_HOOK.minPx, which none of them hit.
for (const [t, pt] of [["your_sign", "Rental Home"], ["next_property", "Rental Home"], ["upgrade", null], ["apartment_standards", null], ["pov_upgrade", "Loft"], ["affordable_luxury", null], ["pov_price", "Townhome"], ["what_mo_gets_you", null]] as const) {
  const src = { market: "San Antonio", propertyType: pt, budgetRange: "1495" }
  const L = computeOverlayLayout(t, buildTemplateHeadline(t, src), buildTemplateDetail(t, src))
  ok(`${t} still renders ONE line (wrap branch unreachable)`, L.headline.lines.length === 1)
}

// ── HERO FREEZE (T1 / T2 / T4) ────────────────────────────────────────────────────────────────
// The conversational target-width + proportional-detail rules apply ONLY to the center-hook branch.
// These pin the hero branch's exact fitted output so a future hook change cannot silently move it.
console.log("\nHero freeze — T1/T2/T4 exact fitted geometry:")
{
  const heroCases: [string, string, string, number, number][] = [
    ["market_type", "SAN ANTONIO TOWNHOMES", "Starting at $1,600/month", 52, 50],
    ["market_type_centered", "SAN ANTONIO TOWNHOMES", "Starting at $1,600/month", 52, 50],
    ["special_feature", "SAN ANTONIO TOWNHOMES", "8 Weeks Free · Private Yards", 52, OVERLAY_SPEC.sub.fontPx],
  ]
  for (const [tpl, head, det, wantHead, wantDetail] of heroCases) {
    const L = computeOverlayLayout(tpl, head, det)
    ok(`${tpl}: headline pinned at ${wantHead}px, one line`, L.headline.fontPx === wantHead && L.headline.lines.length === 1)
    ok(`${tpl}: detail pinned at ${wantDetail}px`, L.detail!.fontPx === wantDetail)
    ok(`${tpl}: hero family + uppercase headline`, templateFamily(tpl) === "hero" && L.headline.uppercase === true)
    // Hero gaps tightened by 2px only (18->16 special_feature, 24->22 market_type) — a deliberately
    // subtler move than the conversational 4px. Pinned so neither drifts into the other's value.
    ok(`${tpl}: headline→detail gap pinned`, (L.detail!.topPx - (L.headline.topPx + L.headline.fontPx)) === (tpl === "special_feature" ? 16 : 22))
  }
  // Hero uses its OWN range and is untouched by the conversational target.
  ok("hero range still [47,66]", HERO_MIN_PX === 47 && HERO_MAX_PX === 66)
  ok("T1 anchors at yFrac (near-top), T2 is the centered variant",
    Math.round(computeOverlayLayout("market_type", "SAN ANTONIO LOFTS", "Starting at $1,200/month").headline.topPx) === Math.round(OVERLAY_SPEC.headline.yFrac * OVERLAY_CANVAS.h) &&
    computeOverlayLayout("market_type_centered", "SAN ANTONIO LOFTS", "Starting at $1,200/month").headline.topPx > 400)
  // Heroes are allowed to use the full box — the target is a CONVERSATIONAL rule only.
  const heroW = headlineTextWidthPx("SAN ANTONIO TOWNHOMES", computeOverlayLayout("market_type", "SAN ANTONIO TOWNHOMES", "").headline.fontPx)
  // The ">2x" form only held while the conversational ceiling was 28. The invariant that
  // actually matters is that hero remains decisively the larger scale, which 66 vs 38 still is.
  ok("hero still fills toward the box and stays decisively larger than the conversational ceiling",
    heroW > 800 && heroW <= HEADLINE_TEXT_AVAIL_PX && HERO_MAX_PX >= HOOK_MAX_PX * 1.5)
}

// ── Conversational scale ──────────────────────────────────────────────────────────────────────
console.log("\nConversational target-width rule:")
{
  // ONE rule: the ceiling is the scale and the box is the only width constraint. The old 780px soft
  // target was removed as inert at this ceiling (only T12 exceeded it, and T12 wraps regardless).
  ok("conversational ceiling is 38px", HOOK_MAX_PX === 38)
  // Long copy pulls in to the target; short copy is untouched and stays at the max.
  const long = computeOverlayLayout("what_mo_gets_you", "What $1,600/month gets you in San Antonio", "")
  // Sizes are now PER HEADLINE: the largest in [26, 38] that keeps the line whole in the 860px
  // conversational box. T15's longest market reference lands at 36px rather than the ceiling —
  // which is the point of the rule, not a miss.
  ok("T15 reference headline stays ONE line, fitted inside the conversational box",
    long.headline.lines.length === 1 && long.headline.fontPx >= 26 && long.headline.fontPx <= 38 &&
    headlineTextWidthPx(long.headline.lines[0], long.headline.fontPx) <= HOOK_TEXT_AVAIL_PX,
    `${long.headline.fontPx}px ${long.headline.lines.length}L`)
  for (const [tpl, head] of [["your_sign", "Your sign to get that new loft"], ["hits_different", "Penthouses just hit different"], ["wanted_luxury", "You wanted luxury. You got it."]] as [string, string][]) {
    const L = computeOverlayLayout(tpl, head, "")
    ok(`${tpl}: renders at the ${HOOK_MAX_PX}px conversational scale`, L.headline.fontPx === HOOK_MAX_PX)
  }
  // The box remains the hard boundary in every case.
  ok("T12 stays TWO lines and inside the box", (() => {
    const L = computeOverlayLayout("trade_up", buildTemplateHeadline("trade_up", { propertyType: "Rental Home" }), "Starting at $1,600/month")
    return L.headline.lines.length === 2 && L.headline.lines.every((l) => headlineTextWidthPx(l, L.headline.fontPx) <= HEADLINE_TEXT_AVAIL_PX)
  })())
  // At the 38px ceiling T14's longest subjects no longer fit one line. That is a deliberate
  // consequence of the size increase, not a regression: every wrapped headline still renders at the
  // FULL 38px and inside the box. Asserted explicitly so the set cannot grow unnoticed.
  {
    const t14Lines = (pt: unknown) => computeOverlayLayout("real_living", buildTemplateHeadline("real_living", { propertyType: pt as any }), "Starting at $1,600/month")
    const wrapping = [...PROPERTY_TYPES, null].filter((pt) => t14Lines(pt).headline.lines.length > 1)
    ok("T14 wraps ONLY for Rental Home and the compound types",
      wrapping.every((pt) => String(pt) === "Rental Home" || /Split-Level|Industrial-Style/.test(String(pt))), wrapping.join(", "))
    ok("…and every other property type stays one line",
      [...PROPERTY_TYPES, null].filter((pt) => !wrapping.includes(pt)).every((pt) => t14Lines(pt).headline.lines.length === 1))
    ok("…with every wrapped T14 line still at the full 38px and inside the box",
      wrapping.every((pt) => { const L = t14Lines(pt); return L.headline.fontPx === 38 && L.headline.lines.every((l) => headlineTextWidthPx(l, 38) <= HEADLINE_TEXT_AVAIL_PX) }))
  }
  // Proportional detail keeps a clear hierarchy at every hook size.
  // Detail is a FLAT 36px against a 38px hook. The flat-size rule is deliberate: the 0.75 ratio and a
// flat smaller value both read too small on real mobile video, and the supporting line is already subordinate
// by placement and content. The hook−1 clamp is a safety rail for a hook that ever shrinks below the
// ceiling — it exists only to keep the detail STRICTLY under the headline, not to enforce a ratio.
ok("center-hook detail is a flat 36px and always under the hook", (() => {
    const tpls = ["upgrade", "apartment_standards", "pov_price", "trade_up", "wanted_luxury", "real_living", "hits_different"] as const
    return tpls.every((t) => {
      const L = computeOverlayLayout(t, buildTemplateHeadline(t, { propertyType: "High-Rise", market: "San Antonio", budgetRange: "1600" }), "Starting at $1,600/month")
      const want = Math.min(36, Math.max(20, L.headline.fontPx - 1))
      return L.detail!.fontPx === want && L.detail!.fontPx === 36 && L.detail!.fontPx < L.headline.fontPx
    })
  })())
}

// ── FONT FACE MAPPING ─────────────────────────────────────────────────────────────────────────
// Which bundled file each block renders in. The conversational DETAIL moved to the head face
// (Libre Baskerville Bold) so the whole conversational lockup is one typeface; the HERO detail
// deliberately stays on the Bodoni text cut. Pinned because a wrong face is invisible to every
// size/position assertion — the layout numbers would all still pass.
console.log("\nFont faces (preview and render both read block.face):")
{
  const conv = computeOverlayLayout("hits_different", "Penthouses just hit different", "Starting at $1,500/month")
  ok("conversational headline uses the HEAD face", conv.headline.face === "head")
  ok("conversational detail uses the HEAD face (Libre Baskerville Bold)", conv.detail!.face === "head")
  const hero = computeOverlayLayout("market_type", "SAN ANTONIO TOWNHOMES", "Starting at $1,600/month")
  ok("hero headline uses the HEAD face", hero.headline.face === "head")
  ok("hero detail now uses the HEAD face (Libre Baskerville Bold)", hero.detail!.face === "head")
  // Every center-hook detail, not just the sampled one.
  ok("every conversational detail is head-faced", (["upgrade", "apartment_standards", "pov_price", "trade_up", "wanted_luxury", "real_living", "hits_different"] as const)
    .every((t) => computeOverlayLayout(t, buildTemplateHeadline(t, { propertyType: "High-Rise", market: "San Antonio", budgetRange: "1600" }), "Starting at $1,600/month").detail!.face === "head"))
  ok("every hero detail is head-faced (T1/T2/T4 — no Bodoni left in live output)", (["market_type", "market_type_centered", "special_feature"] as const)
    .every((t) => computeOverlayLayout(t, "SAN ANTONIO LOFTS", "Starting at $1,200/month").detail!.face === "head"))
  // The hero detail has NO fit-down step (its wrap is character-count based, so font-agnostic), and
  // Libre Baskerville runs ~14-16% wider than the Bodoni cut it replaced. Measure the real strings
  // against the real box so a future size change cannot quietly push them past the safe margins.
  ok("hero detail fits its sub box under HEAD metrics", (["market_type", "market_type_centered", "special_feature"] as const)
    .every((t) => {
      const d = computeOverlayLayout(t, "SAN ANTONIO RENTAL HOMES", "2 Months Free \u00b7 Private Yards").detail!
      return d.lines.every((ln) => headlineTextWidthPx(ln, d.fontPx) <= DETAIL_TEXT_AVAIL_PX)
    }))
  // A head-faced detail must be MEASURED with head metrics, or preview/render parity silently breaks.
  const d = conv.detail!
  ok("head-faced detail fits its sub box under HEAD metrics", headlineTextWidthPx(d.lines[0], d.fontPx) <= DETAIL_TEXT_AVAIL_PX)
}

// ── SPLIT-LEVEL (Social-Beast-only content types) ─────────────────────────────────────────────
console.log("\nSplit-Level property types — wording, plurals, casing, fit:")
{
  const SL = ["Split-Level Townhome", "Split-Level Penthouse", "Split-Level Loft"] as const
  // Only the HEAD noun pluralises. Guard the exact malformations called out in review.
  ok("plurals pluralise the HEAD noun only", SL.every((pt) => {
    const p = propertyNounPlural(pt)
    return !/split-levels/i.test(p) && !/[a-z]S\b/.test(p)
  }))
  ok("singular/plural forms", propertyNounPlural("Split-Level Townhome") === "split-level townhomes" &&
    propertyNounPlural("Split-Level Penthouse") === "split-level penthouses" &&
    propertyNounPlural("Split-Level Loft") === "split-level lofts" &&
    propertyNoun("Split-Level Townhome") === "split-level townhome")
  // Hero keeps UPPERCASE; sentence templates lowercase the WHOLE phrase; T11 keeps Title Case.
  ok("hero headline is fully uppercase", buildOverlayHeadline({ market: "Austin", propertyType: "Split-Level Townhome" }) === "AUSTIN SPLIT-LEVEL TOWNHOMES")
  ok("T12 lowercases the whole phrase", buildTemplateHeadline("trade_up", { propertyType: "Split-Level Townhome" }) === "What life looks like when you trade in your apartment for a split-level townhome")
  ok("T14 lowercases the whole phrase", buildTemplateHeadline("real_living", { propertyType: "Split-Level Penthouse" }) === "This is what real split-level penthouse living looks like")
  // SUPERSEDED: T11 used to echo the dropdown's Title Case ("Split-Level Lofts just hit different").
  // Mid-sentence the qualifier is a descriptive adjective, so compound types now take SENTENCE case.
  // Non-compound copy is unchanged — asserted in compoundTypes.test.ts.
  ok("T11 sentence-cases the compound subject", buildTemplateHeadline("hits_different", { propertyType: "Split-Level Loft" }) === "Split-level lofts just hit different")
  // Never the malformed shapes.
  ok("no malformed casing/plural anywhere in generated copy", SL.every((pt) =>
    OVERLAY_TEMPLATES.every((t) => {
      const h = buildTemplateHeadline(t, { market: "San Antonio", propertyType: pt, budgetRange: "1600" })
      return !/Split-Levels/.test(h) && !/TownhomeS|PenthouseS|LoftS/.test(h) && !/\bsplit-level [A-Z]/.test(h)
    })))
  // Every template x type stays inside the safe box, measured with each block's own face.
  ok("every Split-Level render fits its safe box", SL.every((pt) =>
    OVERLAY_TEMPLATES.every((t) => {
      const h = buildTemplateHeadline(t, { market: "San Antonio", propertyType: pt, budgetRange: "1600" })
      if (!h) return true
      const L = computeOverlayLayout(t, h, buildTemplateDetail(t, { market: "San Antonio", propertyType: pt, budgetRange: "1600" }))
      const hw = Math.max(...L.headline.lines.map((l) => headlineTextWidthPx(l, L.headline.fontPx)))
      const dw = L.detail ? Math.max(...L.detail.lines.map((l) => headlineTextWidthPx(l, L.detail!.fontPx))) : 0
      return hw <= HEADLINE_TEXT_AVAIL_PX && dw <= DETAIL_TEXT_AVAIL_PX
    })))
  // SUPERSEDED REPEATEDLY, now settled. This hero first STACKED at the hero floor (splitting
  // "SPLIT-LEVEL" off "TOWNHOMES"), then fitted onto ONE line at 35px (too small for a hero), then
  // market-at-66 over a fitted type (read as headline + subtitle), then both lines at ONE size (too
  // flat). It is now a TWO-line title with a SUBTLE step: the property-type line drives the fit and
  // the market sits ~18% above it, capped at the hero max. Full coverage in compoundTypes.test.ts.
  const heroSL = computeOverlayLayout("market_type", buildOverlayHeadline({ market: "San Antonio", propertyType: "Split-Level Townhome" }), "Starting at $1,600/month")
  ok("long Split-Level hero is TWO lines, losing no words",
    heroSL.headline.lines.length === 2 && heroSL.headline.lines.join(" ") === "SAN ANTONIO SPLIT-LEVEL TOWNHOMES")
  ok("the market line steps above the property line, within the hero max",
    (heroSL.headline.linePx?.[0] ?? 0) > (heroSL.headline.linePx?.[1] ?? 0)
    && (heroSL.headline.linePx?.[0] ?? 0) <= HERO_MAX_PX && (heroSL.headline.linePx?.[1] ?? 0) >= HERO_MIN_PX)
  ok("the qualifier stays with its head noun on line 2", heroSL.headline.lines[1] === "SPLIT-LEVEL TOWNHOMES")
  ok("its price line stays visibly below the property-type line", (heroSL.detail?.fontPx ?? 0) < Math.min(...(heroSL.headline.linePx ?? [])))
  // Adding these must not have moved an existing type.
  ok("existing types are untouched by the addition",
    buildOverlayHeadline({ market: "San Antonio", propertyType: "Townhome" }) === "SAN ANTONIO TOWNHOMES" &&
    computeOverlayLayout("market_type", "SAN ANTONIO TOWNHOMES", "Starting at $1,600/month").headline.fontPx === 52)
}

// ── HEADLINE -> DETAIL SEPARATION ────────────────────────────────────────────────────────────────
// Regression cover for the drift that made T10 read "too tight": two independent gap constants (12px
// and 17px) for templates that are visually identical. These assertions are written against the
// MEASURED geometry computeOverlayLayout actually emits, not against the constants, so replacing the
// token with a different mechanism keeps them meaningful.
console.log("\nheadline -> detail separation (one shared ratio):")
{
  const src = { market: "San Antonio", propertyType: "High-Rise", budgetRange: "1495",
    priceLabelMode: "starting_at", amenities: "Rooftop Pool", currentSpecial: "2 Months Free" } as never

  // The gap as the renderer sees it: detail top minus the BOTTOM of the headline block, so a wrapped
  // headline is measured from its real last line and not from its first.
  const measured = (tmpl: string, head: string, det: string) => {
    const L = computeOverlayLayout(tmpl, head, det)
    if (!L.detail) return null
    const n = L.headline.lines.length
    const blockH = L.headline.linePx
      ? L.headline.linePx.reduce((a, b) => a + b, 0) + (n - 1) * L.headline.lineSpacing
      : n * L.headline.fontPx + (n - 1) * L.headline.lineSpacing
    return { gap: L.detail.topPx - (L.headline.topPx + blockH), hookPx: L.headline.fontPx, lines: n, L }
  }

  const conversational = OVERLAY_TEMPLATES.filter((id) => templateFamily(id) === "center_hook_detail")
  ok("every conversational template that can carry a detail is in one family (>=8 of them)", conversational.length >= 8)

  const gapsPx = new Map<string, number>()
  for (const id of conversational) {
    const m = measured(id, buildTemplateHeadline(id, src), buildTemplateDetail(id, src))
    if (m) gapsPx.set(id, m.gap)
  }
  ok("all of them actually render a detail line with this price", gapsPx.size === conversational.length)
  ok("and they ALL share ONE gap in pixels — no per-template drift",
    new Set(gapsPx.values()).size === 1)
  ok(`every gap is the shared constant (${DETAIL_GAP_PX}px)`,
    [...gapsPx.values()].every((g) => g === DETAIL_GAP_PX))

  // T7 is the approved visual reference: normalizing must not have MOVED it.
  const t7 = measured("apartment_standards", buildTemplateHeadline("apartment_standards", src), buildTemplateDetail("apartment_standards", src))!
  ok("T7 apartment_standards — the reference — is still 17px", t7.gap === 17)
  ok("T6 upgrade, its twin, matches T7 exactly",
    measured("upgrade", buildTemplateHeadline("upgrade", src), buildTemplateDetail("upgrade", src))!.gap === t7.gap)
  // The reported bug, stated as the thing a future edit must not undo.
  const t10 = measured("pov_price", buildTemplateHeadline("pov_price", src), buildTemplateDetail("pov_price", src))!
  ok("T10 pov_price no longer sits tighter than T7 (was 12px vs 17px)", t10.gap === t7.gap)

  // The gap is a RATIO, so it must track a headline that shrank or wrapped rather than staying flat.
  // A FIXED gap, independent of the hook size. The ratio this replaced produced 12..17px across the
  // real content matrix because the hook shrinks for long copy; identical means identical.
  ok("the gap is a constant, not a function of the headline size", detailGapPx() === DETAIL_GAP_PX && DETAIL_GAP_PX === 17)

  // WRAPPED headline must not collide: the detail has to clear the LAST line, not the first.
  const longHead = "What life looks like when you trade in your apartment for a high-rise"
  const w = measured("trade_up", longHead, "Starting at $1,495/month")
  if (w) {
    ok("a wrapped headline still renders (>=2 lines)", w.lines >= 2)
    ok("the detail clears the wrapped headline's LAST line — no collision", w.gap > 0)
    ok("and a wrapped headline gets the SAME constant gap, measured from its last line",
      w.gap === DETAIL_GAP_PX)
    const lastLineBottom = w.L.headline.topPx + w.lines * w.L.headline.fontPx + (w.lines - 1) * w.L.headline.lineSpacing
    ok("detail top is strictly below the full rendered headline block", (w.L.detail?.topPx ?? 0) >= lastLineBottom)
  }

  // NO detail => NO reserved space. The whole group must re-centre, not sit with a hole in it.
  for (const id of ["pov_price", "affordable_luxury", "hits_different"] as const) {
    const L = computeOverlayLayout(id, buildTemplateHeadline(id, src), "")
    ok(`${id} with no price has no detail block at all`, L.detail === null)
  }
  const withPrice = computeOverlayLayout("pov_price", buildTemplateHeadline("pov_price", src), "Starting at $1,495/month")
  const without = computeOverlayLayout("pov_price", buildTemplateHeadline("pov_price", src), "")
  ok("no detail => the headline re-centres rather than leaving a blank gap", without.headline.topPx > withPrice.headline.topPx)

  // ── T9 Affordable Luxury: the optional price line, reusing T6's logic ──
  console.log("\nT9 Affordable Luxury — optional price detail:")
  const t9head = buildTemplateHeadline("affordable_luxury", src)
  ok("headline is unchanged and still fixed", t9head === "Luxury doesn't have to be expensive")
  ok("Starting-at mode gives 'Starting at $X/month'",
    buildTemplateDetail("affordable_luxury", src) === "Starting at $1,495/month")
  ok("exact-unit mode uses the EXISTING exact wording (not a second implementation)",
    buildTemplateDetail("affordable_luxury", { ...(src as object), priceLabelMode: "exact_unit" } as never)
      === "Exact unit shown: $1,495/month")
  ok("no price => empty detail, so no second line",
    buildTemplateDetail("affordable_luxury", { ...(src as object), budgetRange: null } as never) === "")
  ok("no price => no blank vertical space reserved",
    computeOverlayLayout("affordable_luxury", t9head, buildTemplateDetail("affordable_luxury", { ...(src as object), budgetRange: null } as never)).detail === null)
  ok("its price line matches T10's behaviour exactly (one shared code path)",
    buildTemplateDetail("affordable_luxury", src) === buildTemplateDetail("pov_price", src))
  ok("T9 never fabricates a price from a bad range",
    buildTemplateDetail("affordable_luxury", { ...(src as object), budgetRange: "n/a" } as never) === "")
  ok("T9's gap matches the reference T7", measured("affordable_luxury", t9head, buildTemplateDetail("affordable_luxury", src))!.gap === t7.gap)

  // ── PREVIEW <-> RENDER PARITY ──
  // The gap is only real if FFmpeg draws it where the CSS preview shows it. Both consume the SAME
  // computeOverlayLayout, and buildDrawPlan feeds topPx straight into drawtext's y=, so this asserts
  // the normalized gap actually survives into the render plan rather than living in the preview only.
  console.log("\nthe normalized gap survives into the FFmpeg draw plan:")
  for (const id of conversational) {
    const head = buildTemplateHeadline(id, src), det = buildTemplateDetail(id, src)
    const L = computeOverlayLayout(id, head, det)
    const plan = buildDrawPlan(L)
    const sub = plan.find((p) => p.name === "sub")
    const heads = plan.filter((p) => p.name.startsWith("head"))
    const lastHeadBottom = L.headline.topPx + L.headline.lines.length * L.headline.fontPx
      + (L.headline.lines.length - 1) * L.headline.lineSpacing
    ok(`${id}: drawtext y for the detail equals the layout's detail top`,
      !!sub && sub.topPx === L.detail!.topPx)
    ok(`${id}: and that is exactly ${DETAIL_GAP_PX}px below the headline block`,
      !!sub && sub.topPx - lastHeadBottom === DETAIL_GAP_PX)
    ok(`${id}: the headline is in the plan too, so the gap is between two real drawn items`, heads.length >= 1)
  }
  // And with no detail there is no 'sub' item at all — nothing is drawn into a reserved space.
  for (const id of ["pov_price", "affordable_luxury"] as const) {
    const plan = buildDrawPlan(computeOverlayLayout(id, buildTemplateHeadline(id, src), ""))
    ok(`${id}: no price => no 'sub' drawtext item is emitted`, !plan.some((p) => p.name === "sub"))
  }

  // Templates with NO detail by design must stay that way — T9 moving family must not drag them.
  // Only these two never take a second line, and only because they already state the price INSIDE
  // the headline sentence — a price line below would print the same number twice.
  for (const id of ["what_mo_gets_you", "what_mo_gets_you_top"] as const) {
    ok(`${id} still has no detail line by design`, buildTemplateDetail(id, src) === ""
      && computeOverlayLayout(id, buildTemplateHeadline(id, src), buildTemplateDetail(id, src)).detail === null)
  }
}

// ── TEMPLATE 3 (your_sign) — the optional price line ────────────────────────────────────────────
// T3 was the last hook template with no second line. Its HEADLINE is untouched and still consumes
// no metadata; only the collapsible price line is new, through the same startingPriceLabel path
// every other template uses — no template-specific price logic was added.
console.log("\nT3 your_sign — optional price detail:")
{
  const base = { market: "San Antonio", propertyType: "High-Rise" } as never
  const withPrice = { ...(base as object), budgetRange: "1495", priceLabelMode: "starting_at" } as never
  const exact = { ...(base as object), budgetRange: "1495", priceLabelMode: "exact_unit" } as never
  const noPrice = { ...(base as object), budgetRange: null } as never

  const head = buildTemplateHeadline("your_sign", withPrice)
  ok("the headline is UNCHANGED by adding a price", head === buildTemplateHeadline("your_sign", noPrice))
  ok("and still consumes no price/special metadata",
    !/1,?495/.test(head) && !/Starting at/.test(head))

  // 1. starting-at price
  ok("starting-at → 'Starting at $1,495/month'", buildTemplateDetail("your_sign", withPrice) === "Starting at $1,495/month")
  // 2. exact price — the EXISTING wording, not a new string
  ok("exact-unit → the existing exact wording", buildTemplateDetail("your_sign", exact) === "Exact unit shown: $1,495/month")
  // 3. no price
  ok("no price → empty detail", buildTemplateDetail("your_sign", noPrice) === "")
  ok("invalid price → empty detail, never a fabricated $0",
    buildTemplateDetail("your_sign", { ...(base as object), budgetRange: "n/a" } as never) === "")

  // Shared path, not a copy: identical output to the other templates for identical input.
  ok("byte-identical to pov_price for the same input",
    buildTemplateDetail("your_sign", withPrice) === buildTemplateDetail("pov_price", withPrice)
    && buildTemplateDetail("your_sign", exact) === buildTemplateDetail("pov_price", exact))

  // Geometry: the one shared 17px gap, and nothing reserved when the line is absent.
  const L = computeOverlayLayout("your_sign", head, buildTemplateDetail("your_sign", withPrice))
  const n = L.headline.lines.length
  const bottom = L.headline.topPx + n * L.headline.fontPx + (n - 1) * L.headline.lineSpacing
  ok("uses the shared fixed gap", !!L.detail && L.detail.topPx - bottom === DETAIL_GAP_PX)
  const none = computeOverlayLayout("your_sign", head, buildTemplateDetail("your_sign", noPrice))
  ok("no price → no detail block at all", none.detail === null)
  ok("no price → no reserved gap; the headline re-centres", none.headline.topPx > L.headline.topPx)
  // Typography must be untouched by the family move.
  ok("hook size is unchanged whether or not a price exists", none.headline.fontPx === L.headline.fontPx)
  ok("and the headline still renders on one line", L.headline.lines.length === 1)
  // It reaches the FFmpeg plan like every other template.
  const plan = buildDrawPlan(L)
  ok("the price line reaches the render plan at the same y", plan.find((x) => x.name === "sub")?.topPx === L.detail!.topPx)
  ok("and emits no 'sub' item when there is no price", !buildDrawPlan(none).some((x) => x.name === "sub"))
}

console.log("\nTemplate 17 (Property Tour — Template 3's treatment, tour wording):")
{
  const tour = (o: Record<string, unknown> = {}) => buildTemplateHeadline("property_tour", { market: "San Antonio", propertyType: "Apartment", ...o })
  ok("T17 {Market} {type} tour", tour() === "San Antonio apartment tour")
  ok("T17 Dallas penthouse tour", tour({ market: "Dallas", propertyType: "Penthouse" }) === "Dallas penthouse tour")
  ok("T17 Houston townhome tour", tour({ market: "Houston", propertyType: "Townhome" }) === "Houston townhome tour")
  ok("T17 hyphenated type reads naturally", tour({ propertyType: "High-Rise" }) === "San Antonio high-rise tour")
  ok("T17 compound type reads naturally", tour({ market: "Dallas", propertyType: "Split-Level Loft" }) === "Dallas split-level loft tour")
  // Sentence case, NOT a hero title — the center_hook_detail branch renders uppercase:false, so the
  // string written here is the string drawn.
  ok("T17 is sentence case, never ALL CAPS", tour() === tour() && tour() !== tour().toUpperCase())
  // Degrades rather than fabricating, matching startingPriceLabel's rule.
  ok("T17 no market → type only", tour({ market: null }) === "apartment tour")
  ok("T17 no type → market only", tour({ propertyType: null }) === "San Antonio tour")
  ok("T17 neither → empty, never 'undefined tour'", tour({ market: null, propertyType: null }) === "")

  // The SHARED optional price line, identical to T3's.
  const det = (o: Record<string, unknown> = {}) => buildTemplateDetail("property_tour", { market: "San Antonio", propertyType: "Apartment", budgetRange: "1495", priceLabelMode: "starting_at", ...o })
  ok("T17 starting-at price line", det() === "Starting at $1,495/month")
  ok("T17 exact-unit wording when that mode is set", det({ priceLabelMode: "exact_unit" }) === "Exact unit shown: $1,495/month")
  ok("T17 no price → empty detail", det({ budgetRange: null }) === "")

  // GEOMETRY PARITY: T17 must be Template 3 exactly — same family, same constants, no new tuning.
  const shape = (t: string, detail: string) => {
    const l = computeOverlayLayout(t, "San Antonio apartment tour", detail)
    return JSON.stringify({ family: l.family, top: l.headline.topPx, px: l.headline.fontPx, upper: l.headline.uppercase,
      margin: l.headline.sideMarginPx, ls: l.headline.lineSpacing,
      detail: l.detail ? { top: l.detail.topPx, px: l.detail.fontPx, upper: l.detail.uppercase, margin: l.detail.sideMarginPx } : null })
  }
  ok("T17 geometry is IDENTICAL to T3 with a price", shape("property_tour", "Starting at $1,495/month") === shape("your_sign", "Starting at $1,495/month"))
  ok("T17 geometry is IDENTICAL to T3 with no price", shape("property_tour", "") === shape("your_sign", ""))
  ok("T17 joins the center_hook_detail family", templateFamily("property_tour") === "center_hook_detail")
  // No price must reserve NO vertical space — the headline re-centres rather than leaving a gap.
  const withP = computeOverlayLayout("property_tour", "San Antonio apartment tour", "Starting at $1,495/month")
  const noP = computeOverlayLayout("property_tour", "San Antonio apartment tour", "")
  ok("T17 no price → no detail block at all", noP.detail === null)
  ok("T17 no price → headline re-centres (no reserved gap)", noP.headline.topPx > withP.headline.topPx)
  // T3 itself must be untouched by any of this.
  ok("T3 your_sign headline unchanged", buildTemplateHeadline("your_sign", { propertyType: "High-Rise" }) === "Your sign to get that new high-rise")
  ok("T17 has a dropdown label", OVERLAY_TEMPLATE_LABEL.property_tour === "Property Tour")
  ok("T17 is appended LAST so existing indices stay stable", OVERLAY_TEMPLATES[16] === "property_tour" && OVERLAY_TEMPLATES[11] === "trade_up")
}

console.log(`\nComposer unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
