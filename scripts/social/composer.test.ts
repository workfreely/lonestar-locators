// Focused unit tests for the Post Composer's auto-preparation + hashtag bank + render args.
// Pure logic only — no network, no ffmpeg. Run: npx tsx scripts/social/composer.test.ts
import { buildHashtags, normalizeHashtag, HASHTAG_MARKETS } from "@/lib/social/hashtags"
import { AMENITY_BANK, canonicalizeAmenity, parseAmenities, serializeAmenities, sanitizeCustomAmenity } from "@/lib/social/amenities"
import { preparePost, buildCaption, buildOverlayHeadline, buildOverlaySubheadline, composeFinalCaption, startingPriceLabel, buildOverlayDetail, joinDetailParts, specialDisplay, resolveSocialSpecial, isGeneratedHeadline, isGeneratedCaption, isGeneratedHashtags } from "@/lib/social/composePost"
import { SOCIAL_SPECIAL_OPTIONS, giftCardLabel, isGiftCardSpecial, sanitizeCustomSpecial } from "@/lib/social/socialSpecial"
import { buildFfmpegArgs, buildVideoFilter } from "@/lib/social/renderVideo"
import { wrapHeadline, wrapSub, overlayPreviewStyle, headlineFit, headlineTextWidthPx, computeOverlayLayout, OVERLAY_SPEC, OVERLAY_TEXT, HEADLINE_TEXT_AVAIL_PX, HERO_MAX_PX, HERO_MIN_PX, HOOK_MAX_PX, HOOK_MIN_PX, detailTextWidthPx, DETAIL_TEXT_AVAIL_PX } from "@/lib/social/overlaySpec"
import { buildTemplateHeadline, buildTemplateDetail, OVERLAY_TEMPLATES } from "@/lib/social/composePost"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

console.log("hashtag engine (centralized, deterministic, max 7 — details in hashtags.test.ts):")
ok("markets include Austin/Dallas/DFW/Houston/San Antonio", ["Austin","Dallas","Houston","San Antonio"].every((m) => HASHTAG_MARKETS.includes(m)))
const dallas = buildHashtags("Dallas", 7, "Apartment")
ok("Dallas has #dallasapartments", dallas.includes("#dallasapartments"))
ok("capped at 7", dallas.length <= 7)
ok("no duplicates", new Set(dallas.map((s) => s.toLowerCase())).size === dallas.length)
ok("San Antonio market tags present", buildHashtags("San Antonio", 7, "Apartment").some((t) => /sanantonio|satx/.test(t)))
ok("unknown market still yields a non-empty relevant set (property + base)", buildHashtags("Nowhere", 7, "Apartment").length >= 1)

console.log("normalizeHashtag:")
ok("adds # and strips junk", normalizeHashtag("  luxury apts! ") === "#luxuryapts")
ok("collapses leading #", normalizeHashtag("##atx") === "#atx")
ok("empty → empty", normalizeHashtag("  ") === "")

console.log("auto-prepare (PUBLIC-SAFE only — never the property name/area/notes):")
// Botanica Oak Hills is the INTERNAL canonical property; it must NOT appear in public copy.
const src = { market: "San Antonio", propertyType: "Townhome", special: "1 Month Free", budgetRange: "$1,200–$1,600", amenities: "private yard, garage, pool" }
const prep = preparePost(src, "seed-A")
ok("headline = MARKET + TYPE (not property name)", prep.overlayHeadline === "SAN ANTONIO TOWNHOMES")
ok("subheadline = Starting-at lowest price (Template 1)", prep.overlaySubheadline === "Starting at $1,200/mo")
ok("caption includes special + bulleted amenities; NO price line (overlay-only)", prep.caption.includes("✨ 1 Month Free") && prep.caption.includes("🏡 Amenities\n• private yard\n• garage\n• pool") && !prep.caption.includes("💰"))
ok("caption at most 7 hashtags prepared separately", prep.hashtags.length <= 7 && prep.hashtags.length >= 1)
// Even if a property name were somehow supplied, the type-level SourceMeta drops it — verify no
// internal identity leaks into the public copy.
const leaky = preparePost({ market: "San Antonio", propertyType: "Townhome", amenities: "private yard, garage, pool", ...( { propertyName: "Botanica Oak Hills", areaNeighborhood: "Medical Center", notes: "call owner" } as unknown as object) }, "seed-B")
ok("internal property name never leaks into caption", !leaky.caption.includes("Botanica"))
ok("internal area never leaks into caption/overlay", !leaky.caption.includes("Medical Center") && !leaky.overlayHeadline.includes("MEDICAL") && !leaky.overlaySubheadline.includes("MEDICAL"))
ok("internal notes never leak", !leaky.caption.includes("call owner"))

console.log("APPROVED caption template (4 rotating hooks, conditional lines, fixed CTA):")
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
ok("✨ line present (special normalized to social-display form)", full.includes("✨ 8 Weeks Free"))
ok("🏡 amenities bulleted, canonicalized, capped at 3, no 4th", full.includes("🏡 Amenities\n• Rooftop Pool\n• Fitness Center\n• Dog Park") && !full.includes("sauna"))
ok("NO 💰 price line in caption (price lives in the overlay detail only)", !full.includes("💰"))
const noSpecial = buildCaption({ market: "Dallas", propertyType: "Townhome", amenities: "Private yard", budgetRange: "Starting at $1,895" }, "z")
ok("✨ line OMITTED entirely (emoji included) when special missing", !noSpecial.includes("✨"))
ok("🏡 single amenity → heading + one bullet", noSpecial.includes("🏡 Amenities\n• Private yard"))
const bare = buildCaption({ market: "Dallas", propertyType: "Townhome" }, "z")
ok("no 🏡/💰/✨ lines when none present", !bare.includes("🏡") && !bare.includes("💰") && !bare.includes("✨"))
// Fixed CTA — always, verbatim, no emoji, never rotated. The two sentences are separated by a
// blank line (their own sections), so the caption renders them one line apart.
ok("fixed CTA present verbatim (blank line between the two sentences)", full.includes("My apartment locating service is completely free!\n\nSubmit the form to get your free custom apartment list."))
ok("caption always ends with the CTA", full.endsWith("Submit the form to get your free custom apartment list.") && bare.endsWith("Submit the form to get your free custom apartment list."))
ok("CTA has no emoji", !/[☀-➿\uD83C-\uDBFF]/.test("My apartment locating service is completely free! Submit the form to get your free custom apartment list."))
// No city AND no type → no hook line at all (never an unresolved placeholder); starts with CTA.
ok("no city + no type → caption starts with the CTA (no empty hook)", buildCaption({}).split("\n")[0] === "My apartment locating service is completely free!")

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
ok("' 8 weeks free ' → '✨ 8 Weeks Free' (trimmed + normalized)", buildCaption({ market: "Dallas", special: " 8 weeks free " }, "s0").includes("✨ 8 Weeks Free"))
ok("budgetRange present → still NO 💰 line (price is overlay-only)", !buildCaption({ market: "Dallas", budgetRange: " Starting at $1,495 " }, "s0").includes("💰"))
// Amenities with surrounding + inter-item whitespace → exact bulleted list.
ok("messy amenities → bulleted, canonicalized '🏡 Amenities' list", buildCaption({ market: "Dallas", amenities: "  Rooftop pool ,  fitness center , dog park  " }, "s0").includes("🏡 Amenities\n• Rooftop Pool\n• Fitness Center\n• Dog Park"))
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

console.log("Template 1 subheadline: 'Starting at {lowest}/mo' (or empty; special stays in caption):")
ok("range → lowest price", startingPriceLabel("$1,495–$2,100") === "Starting at $1,495/mo")
ok("single value → that price", startingPriceLabel("$1,895") === "Starting at $1,895/mo")
ok("open-ended '$1,200+' → 1200", startingPriceLabel("$1,200+") === "Starting at $1,200/mo")
ok("surrounding whitespace trimmed", startingPriceLabel("  $2,000 – $3,000  ") === "Starting at $2,000/mo")
ok("no digits → empty (no fabrication)", startingPriceLabel("Call for pricing") === "" && startingPriceLabel("") === "" && startingPriceLabel(null) === "")
ok("sub uses starting price from range", buildOverlaySubheadline({ market: "Dallas", budgetRange: "$1,495–$2,100" }) === "Starting at $1,495/mo")
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
ok("Hero fit range is 56–66px", HERO_MIN_PX === 56 && HERO_MAX_PX === 66)
ok("EVERY supported combo fits the 900px safe box at its fitted size", allFit)
ok("shorter combo renders LARGER (SAN ANTONIO TOWNHOMES > SAN ANTONIO RENTAL HOMES)", headlineFit("SAN ANTONIO TOWNHOMES").fontPx > headlineFit("SAN ANTONIO RENTAL HOMES").fontPx)
ok("widest combo SAN ANTONIO RENTAL HOMES still fits one line via fit-down", headlineFit("SAN ANTONIO RENTAL HOMES").lines.length === 1 && headlineTextWidthPx("SAN ANTONIO RENTAL HOMES", headlineFit("SAN ANTONIO RENTAL HOMES").fontPx) <= HEADLINE_TEXT_AVAIL_PX)
ok("Loft combos are supported one-line (e.g. SAN ANTONIO LOFTS)", headlineFit("SAN ANTONIO LOFTS").lines.length === 1)
ok("usable text width = safe area (no box) = 900px (90px margins)", HEADLINE_TEXT_AVAIL_PX === 900)
ok("unknown/custom headline char-wraps at the Hero minimum size", headlineFit("SOME ENTIRELY CUSTOM HEADLINE TEXT").fontPx === HERO_MIN_PX)

console.log("Template 1 vertical lockup: tightened headline→sub gap:")
ok("gap is 35px (tightened from 44)", OVERLAY_SPEC.sub.gapPx === 35)
ok("a smaller (fit) headline font pulls the sub UP", overlayPreviewStyle(1, 71).subTopPct < overlayPreviewStyle(1, 94).subTopPct)

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
ok("headline box keeps safe side margins (8.3% each; not edge-to-edge)", overlayPreviewStyle(1).sideMarginPct >= 8 && overlayPreviewStyle(1).sideMarginPct < 12)
ok("sub box is wider than the headline box but still safely inset", overlayPreviewStyle(1).subSideMarginPct < overlayPreviewStyle(1).sideMarginPct && overlayPreviewStyle(1).subSideMarginPct >= 6)
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
ok("generated hashtags recognized (Dallas)", isGeneratedHashtags(buildHashtags("Dallas", 7, "Townhome"), { market: "Dallas", propertyType: "Townhome" }))
ok("stale San Antonio hashtags recognized as generated (any market)", isGeneratedHashtags(buildHashtags("San Antonio", 7, "Townhome"), { market: "Dallas", propertyType: "Townhome" }))
ok("custom hashtags NOT generated", !isGeneratedHashtags(["#mycustomtag", "#anothercustom"], { market: "Dallas" }))

console.log("overlay detail (Template 1 formula) + CASE A/B sync:")
ok("detail = Starting at price", buildOverlayDetail({ budgetRange: "1495" }) === "Starting at $1,495/mo")
ok("detail empty when no price", buildOverlayDetail({}) === "")
// CASE A: Dallas + Townhome + 1495
ok("A overlay headline", buildOverlayHeadline({ market: "Dallas", propertyType: "Townhome" }) === "DALLAS TOWNHOMES")
ok("A overlay detail", buildOverlayDetail({ budgetRange: "1495" }) === "Starting at $1,495/mo")
ok("A hashtags are Dallas, max 7, ZERO San Antonio", (() => { const h = buildHashtags("Dallas", 7, "Townhome"); return h.length <= 7 && h.includes("#dallasapartments") && !h.some((t) => t.includes("sanantonio") || t.includes("satx")) })())
// CASE B: Dallas + Loft + 1495
ok("B overlay headline", buildOverlayHeadline({ market: "Dallas", propertyType: "Loft" }) === "DALLAS LOFTS")
ok("B hashtags Dallas + loft, ZERO San Antonio", (() => { const h = buildHashtags("Dallas", 7, "Loft"); return h.length <= 7 && h.includes("#dallasapartments") && h.includes("#loft") && !h.some((t) => t.includes("sanantonio") || t.includes("satx")) })())

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
ok("caption uses the concise special display in the ✨ section", houston.includes("✨ 8 Weeks Free") && !houston.includes("Restrictions apply"))
ok("amenities render as a heading + '• ' bullets (canonicalized; not a comma line)", houston.includes("🏡 Amenities\n• Floor-to-Ceiling Windows\n• modern appliances\n• kitchen counter") && !houston.includes("windows, modern"))
ok("ONE blank line between each present section (join with \\n\\n)", houston.split("\n").filter((l) => l === "").length >= 4 && !/\n\n\n/.test(houston))
ok("blank line between the two fixed CTA sentences", houston.includes("My apartment locating service is completely free!\n\nSubmit the form to get your free custom apartment list."))
ok("caption ends with CTA sentence 2", houston.endsWith("Submit the form to get your free custom apartment list."))
ok("hook is the first line, followed by a blank line", (() => { const lines = houston.split("\n"); return lines[0].length > 0 && lines[1] === "" })())
// Amenities capping + empty-entry hygiene in the bulleted list.
const bulletCap = buildCaption({ market: "Houston", amenities: "one, two, , three, four" }, "s0")
ok("bulleted amenities capped at 3, empties ignored", bulletCap.includes("🏡 Amenities\n• one\n• two\n• three") && !bulletCap.includes("• four"))
// No amenities → the whole Amenities section (heading + bullets) is omitted.
ok("no amenities → no '🏡 Amenities' heading at all", !buildCaption({ market: "Houston", propertyType: "Townhome" }, "s0").includes("🏡"))

console.log("overlay detail one-line composition helper (· separator; future template rules):")
ok("special + price → '8 Weeks Free · Starting at $1,495/mo'", joinDetailParts([specialDisplay("8 weeks free"), startingPriceLabel("1495")]) === "8 Weeks Free · Starting at $1,495/mo")
ok("special only", joinDetailParts([specialDisplay("8 weeks free"), startingPriceLabel(null)]) === "8 Weeks Free")
ok("price only", joinDetailParts([specialDisplay(null), startingPriceLabel("1495")]) === "Starting at $1,495/mo")
ok("neither → empty (no detail)", joinDetailParts([specialDisplay(null), startingPriceLabel(null)]) === "")
ok("uses centered-dot ' · ' separator, never comma/pipe", (() => { const d = joinDetailParts(["A", "B"]); return d === "A · B" && !d.includes(",") && !d.includes("|") })())

console.log("CASE 14 — Houston + Townhome + 1495 (Template 1 is PRICE-ONLY; special stays in caption):")
ok("Template 1 overlay headline", buildOverlayHeadline({ market: "Houston", propertyType: "Townhome" }) === "HOUSTON TOWNHOMES")
ok("Template 1 overlay detail is price-only (does NOT add the special)", buildOverlayDetail({ market: "Houston", propertyType: "Townhome", special: "8 weeks free", budgetRange: "1495" }) === "Starting at $1,495/mo")
ok("Houston hashtags: market bank, max 7, ZERO San Antonio / Dallas", (() => { const h = buildHashtags("Houston", 7, "Townhome"); return h.length <= 7 && h.includes("#houstonapartments") && !h.some((t) => /sanantonio|satx|dallas|dfw/.test(t)) })())
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
ok("caption uses first 3 selected amenities, in order, bulleted", capSel.includes("🏡 Amenities\n• Private Yards\n• Attached Garages\n• Floor-to-Ceiling Windows"))
ok("4th selected amenity stored but NOT in caption (max 3)", !capSel.includes("Fitness Center"))

console.log("Social Special selector (standardized short-forms + gift card + custom):")
ok("standardized options use NUMBERS, not spelled-out", SOCIAL_SPECIAL_OPTIONS.includes("8 Weeks Free") && SOCIAL_SPECIAL_OPTIONS.includes("1 Month Free") && SOCIAL_SPECIAL_OPTIONS.includes("Free Movers") && !SOCIAL_SPECIAL_OPTIONS.some((o) => /eight|six|one month/i.test(o)))
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
ok("Template 1 overlay detail stays PRICE-ONLY regardless of Social Special", buildOverlayDetail({ ...rawKept, budgetRange: "1495" }) === "Starting at $1,495/mo")
ok("one primary Social Special (single value feeds caption)", (capExplicit.match(/✨/g) || []).length === 1)

console.log("overlay typography = subtle tracking + localized drop shadow (NO band/box/scrim):")
const hugFilt = buildVideoFilter("/f.ttf", [{ file: "/h.txt", fontPx: 78, topPx: 250, lineSpacing: 8 }, { file: "/s.txt", fontPx: 40, topPx: 420, lineSpacing: 6 }])
ok("NO scrim/band/box in render (no geq/overlay/box)", !hugFilt.includes("geq=") && !hugFilt.includes("overlay=") && !hugFilt.includes("box=1"))
ok("drawtext has a subtle drop shadow (offset)", hugFilt.includes("shadowcolor=black@") && hugFilt.includes("shadowy="))
ok("NO visible outline (edge alpha 0 — crisp solid white)", OVERLAY_TEXT.edgeAlpha === 0)
ok("tracking is subtle (Option A)", OVERLAY_TEXT.trackingEm > 0 && OVERLAY_TEXT.trackingEm <= 0.05)
ok("drop-shadow is subtle / non-obvious (insurance for white footage)", OVERLAY_TEXT.shadowAlpha > 0 && OVERLAY_TEXT.shadowAlpha <= 0.6)
ok("render graph still outputs the [v] label", /\[v\]$/.test(hugFilt))

console.log("Overlay TEMPLATES 1–5 (headline/detail generation + layout families):")
const tMeta = { market: "San Antonio", propertyType: "High-Rise", socialSpecial: "8 Weeks Free", budgetRange: "1600", amenities: "Private Yards, Rooftop Pool" }
ok("8 templates defined", OVERLAY_TEMPLATES.length === 8)
// T1 Market + Type (HERO)
ok("T1 headline = CITY TYPE_PLURAL", buildTemplateHeadline("market_type", tMeta) === "SAN ANTONIO HIGH-RISES")
ok("T1 detail = Starting at price", buildTemplateDetail("market_type", tMeta) === "Starting at $1,600/mo")
ok("T1 detail omitted when no price", buildTemplateDetail("market_type", { market: "San Antonio", propertyType: "High-Rise" }) === "")
// T2 Your Sign (CENTER HOOK, no detail)
ok("T2 headline hook", buildTemplateHeadline("your_sign", tMeta) === "Your sign to get that high-rise in San Antonio")
ok("T2 no detail", buildTemplateDetail("your_sign", tMeta) === "")
// T3 Special + Feature (HERO)
ok("T3 headline = CITY TYPE_PLURAL", buildTemplateHeadline("special_feature", tMeta) === "SAN ANTONIO HIGH-RISES")
ok("T3 detail special + feature", buildTemplateDetail("special_feature", tMeta) === "8 Weeks Free · Private Yards")
ok("T3 detail special only", buildTemplateDetail("special_feature", { market: "Dallas", propertyType: "Townhome", socialSpecial: "8 Weeks Free" }) === "8 Weeks Free")
ok("T3 detail feature only", buildTemplateDetail("special_feature", { market: "Dallas", propertyType: "Townhome", amenities: "Private Yards" }) === "Private Yards")
ok("T3 detail neither → empty", buildTemplateDetail("special_feature", { market: "Dallas", propertyType: "Townhome" }) === "")
// T4 Next Property (CENTER HOOK, no detail)
ok("T4 headline hook", buildTemplateHeadline("next_property", tMeta) === "What your next high-rise could look like")
ok("T4 no detail", buildTemplateDetail("next_property", tMeta) === "")
// T5 Upgrade (CENTER HOOK + DETAIL)
ok("T5 headline fixed", buildTemplateHeadline("upgrade", tMeta) === "What life looks like when you upgrade")
ok("T5 detail special + price", buildTemplateDetail("upgrade", tMeta) === "8 Weeks Free · Starting at $1,600/mo")
ok("T5 detail price only", buildTemplateDetail("upgrade", { market: "San Antonio", propertyType: "High-Rise", budgetRange: "1600" }) === "Starting at $1,600/mo")
// Layout families
ok("T1/T3 are HERO (headline near top, uppercase)", computeOverlayLayout("market_type", "SAN ANTONIO HIGH-RISES", "Starting at $1,600/mo").family === "hero" && computeOverlayLayout("special_feature", "X", "").family === "hero")
ok("T2/T4 are CENTER HOOK (no detail block)", computeOverlayLayout("your_sign", "Your sign to get that high-rise in San Antonio", "").family === "center_hook" && computeOverlayLayout("next_property", "What your next high-rise could look like", "").family === "center_hook")
ok("T5 is CENTER HOOK + DETAIL", computeOverlayLayout("upgrade", "What life looks like when you upgrade", "8 Weeks Free · Starting at $1,600/mo").family === "center_hook_detail")
const heroL = computeOverlayLayout("market_type", "SAN ANTONIO HIGH-RISES", "Starting at $1,600/mo")
ok("HERO headline sits near the top; detail below it", heroL.headline.topPx < 400 && !!heroL.detail && heroL.detail.topPx > heroL.headline.topPx)
ok("HERO headline is uppercase-flagged; center hook is not", heroL.headline.uppercase === true && computeOverlayLayout("your_sign", "Your sign", "").headline.uppercase === false)
const hookL = computeOverlayLayout("your_sign", "Your sign to get that high-rise in San Antonio", "")
ok("CENTER HOOK is vertically centred (not near the top)", hookL.headline.topPx > 400 && hookL.headline.topPx < 1920 && hookL.detail === null)
ok("CENTER HOOK uses a smaller size than the Hero headline (not forced giant)", hookL.headline.fontPx < heroL.headline.fontPx)
const upL = computeOverlayLayout("upgrade", "What life looks like when you upgrade", "8 Weeks Free · Starting at $1,600/mo")
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
// Center-hook fit-to-width: sizes land in [HOOK_MIN_PX, HOOK_MAX_PX]; shorter hooks render larger,
// the longest supported hook shrinks only as needed, both fit the 900px safe box.
const t2Short = computeOverlayLayout("your_sign", buildTemplateHeadline("your_sign", { market: "San Antonio", propertyType: "Townhome" }), "").headline
const t2Long = computeOverlayLayout("your_sign", buildTemplateHeadline("your_sign", { market: "San Antonio", propertyType: "Rental Home" }), "").headline
ok("center-hook fit range is 37–46px", HOOK_MIN_PX === 37 && HOOK_MAX_PX === 46)
ok("center-hook fitted size stays within [37,46]", t2Short.fontPx >= HOOK_MIN_PX && t2Short.fontPx <= HOOK_MAX_PX && t2Long.fontPx >= HOOK_MIN_PX && t2Long.fontPx <= HOOK_MAX_PX)
ok("shorter hook renders LARGER than the longest hook", t2Short.fontPx > t2Long.fontPx)
ok("longest hook fits the 900px safe box at its fitted size", headlineTextWidthPx(t2Long.lines[0], t2Long.fontPx) <= HEADLINE_TEXT_AVAIL_PX)

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
ok("T6 no detail line", buildTemplateDetail("pov_upgrade", tMeta) === "")
ok("T6 is CENTER HOOK (no detail block)", computeOverlayLayout("pov_upgrade", buildTemplateHeadline("pov_upgrade", { propertyType: "Townhome" }), "").family === "center_hook" && computeOverlayLayout("pov_upgrade", "x", "").detail === null)
// T7 — fixed universal hook; no variables/metadata, no detail.
ok("T7 headline is the fixed universal hook", buildTemplateHeadline("affordable_luxury", tMeta) === "Luxury doesn't have to be expensive")
ok("T7 ignores ALL metadata (type/market/special/price)", buildTemplateHeadline("affordable_luxury", { market: "Dallas", propertyType: "Loft", socialSpecial: "8 Weeks Free", budgetRange: "1200" }) === "Luxury doesn't have to be expensive")
ok("T7 no detail line", buildTemplateDetail("affordable_luxury", tMeta) === "")
ok("T7 is CENTER HOOK (no detail block)", computeOverlayLayout("affordable_luxury", "Luxury doesn't have to be expensive", "").family === "center_hook")
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
ok("selector lists exactly 8 templates ending in pov_upgrade, affordable_luxury, pov_price", OVERLAY_TEMPLATES.length === 8 && OVERLAY_TEMPLATES[5] === "pov_upgrade" && OVERLAY_TEMPLATES[6] === "affordable_luxury" && OVERLAY_TEMPLATES[7] === "pov_price")

console.log("Template 8 (POV + Price — CENTER HOOK + DETAIL):")
// T8 headline = same explicit POV per-type mapping as T6.
for (const [type, expected] of Object.entries(POV)) {
  ok(`T8 headline ${type} → "${expected}"`, buildTemplateHeadline("pov_price", { market: "San Antonio", propertyType: type }) === expected)
}
ok("T8 no property type → 'POV: You upgraded'", buildTemplateHeadline("pov_price", {}) === "POV: You upgraded")
ok("T8 detail = 'Starting at $X/mo' when a price exists", buildTemplateDetail("pov_price", { propertyType: "Townhome", budgetRange: "1800" }) === "Starting at $1,800/mo")
ok("T8 detail omitted when NO price", buildTemplateDetail("pov_price", { propertyType: "Townhome" }) === "")
ok("T8 detail ignores special/amenities (price only)", buildTemplateDetail("pov_price", { propertyType: "Loft", budgetRange: "1250", socialSpecial: "8 Weeks Free", amenities: "Rooftop Pool" }) === "Starting at $1,250/mo")
const t8 = computeOverlayLayout("pov_price", "POV: You upgraded to a townhome", "Starting at $1,800/mo")
ok("T8 is CENTER HOOK + DETAIL (headline + detail block)", t8.family === "center_hook_detail" && !!t8.detail && t8.detail.lines.length === 1)
ok("T8 detail sits below the headline", !!t8.detail && t8.detail.topPx > t8.headline.topPx)
ok("T8 hierarchy: detail smaller than the POV headline", !!t8.detail && t8.detail.fontPx < t8.headline.fontPx)
ok("T8 headline is ONE line (fit-to-width) within the safe box", t8.headline.lines.length === 1 && headlineTextWidthPx(t8.headline.lines[0], t8.headline.fontPx) <= HEADLINE_TEXT_AVAIL_PX)
const t8NoPrice = computeOverlayLayout("pov_price", "POV: You upgraded to a loft", "")
ok("T8 with no price → headline only (no detail block)", t8NoPrice.detail === null)
ok("T8 headline re-syncs with Property Type (generator-owned)", isGeneratedHeadline("POV: You upgraded to a townhome") && buildTemplateHeadline("pov_price", { propertyType: "Loft" }) === "POV: You upgraded to a loft")
// /mo canonical output has NO space between "/" and "mo" (multiple prices).
for (const [p, exp] of [["995", "Starting at $995/mo"], ["1250", "Starting at $1,250/mo"], ["1800", "Starting at $1,800/mo"], ["2495", "Starting at $2,495/mo"]] as const) {
  ok(`price ${p} → "${exp}" (no '/ mo' space)`, startingPriceLabel(p) === exp && !startingPriceLabel(p).includes("/ mo"))
}

console.log("Template 1 detail size (larger price line; T1 only):")
const t1d = computeOverlayLayout("market_type", "SAN ANTONIO TOWNHOMES", "Starting at $1,800/mo").detail
ok("T1 detail renders at 52px (larger secondary line)", !!t1d && t1d.fontPx === 52)
ok("T1 detail stays ONE line for all test prices", ["Starting at $995/mo", "Starting at $1,250/mo", "Starting at $1,800/mo", "Starting at $2,495/mo"].every((p) => computeOverlayLayout("market_type", "SAN ANTONIO LOFTS", p).detail!.lines.length === 1))
ok("T3 (special_feature) detail UNCHANGED at the shared sub size", (computeOverlayLayout("special_feature", "SAN ANTONIO TOWNHOMES", "8 Weeks Free · Private Yards").detail!.fontPx) === OVERLAY_SPEC.sub.fontPx)
ok("T1 detail still clearly secondary to the headline", !!t1d && t1d.fontPx < computeOverlayLayout("market_type", "SAN ANTONIO TOWNHOMES", "Starting at $1,800/mo").headline.fontPx)

console.log("Templates 5 & 8 detail hierarchy (supporting the hook — one line, secondary, tight gap):")
// T5 Upgrade — detail 38px (reduced to support, not compete), one line for every fallback.
const t5cases = ["8 Weeks Free · Starting at $1,900/mo", "Starting at $1,900/mo", "8 Weeks Free"]
for (const d of t5cases) {
  const L = computeOverlayLayout("upgrade", "What life looks like when you upgrade", d)
  ok(`T5 detail one line, 38px, secondary: "${d}" (${L.detail!.fontPx}px)`, L.detail!.lines.length === 1 && L.detail!.fontPx === 38 && L.detail!.fontPx < L.headline.fontPx && detailTextWidthPx(d, L.detail!.fontPx) <= DETAIL_TEXT_AVAIL_PX)
}
// T8 POV + Price — price detail 40px (strong but below the POV headline), one line for all prices.
for (const p of ["Starting at $995/mo", "Starting at $1,250/mo", "Starting at $1,900/mo", "Starting at $2,495/mo"]) {
  const L = computeOverlayLayout("pov_price", "POV: You upgraded to a townhome", p)
  ok(`T8 price one line, 40px, secondary: "${p}" (${L.detail!.fontPx}px)`, L.detail!.lines.length === 1 && L.detail!.fontPx === 40 && L.detail!.fontPx < L.headline.fontPx && detailTextWidthPx(p, L.detail!.fontPx) <= DETAIL_TEXT_AVAIL_PX)
}
ok("T8 price detail is larger than T5 detail (price stays strong)", computeOverlayLayout("pov_price", "POV: You upgraded to a townhome", "Starting at $1,900/mo").detail!.fontPx > computeOverlayLayout("upgrade", "What life looks like when you upgrade", "Starting at $1,900/mo").detail!.fontPx)
// Tighter gap: center-hook detail sits closer than the standard Hero sub gap; T3 gap tighter too.
const t5L = computeOverlayLayout("upgrade", "What life looks like when you upgrade", "Starting at $1,900/mo")
ok("T5 detail sits within ~20px below the hook (tight lockup)", !!t5L.detail && (t5L.detail.topPx - (t5L.headline.topPx + t5L.headline.fontPx)) <= 20)
const t3gap = computeOverlayLayout("special_feature", "SAN ANTONIO TOWNHOMES", "8 Weeks Free · Private Yards")
const t1gap = computeOverlayLayout("market_type", "SAN ANTONIO TOWNHOMES", "Starting at $1,900/mo")
const t1GapPx = t1gap.detail!.topPx - (t1gap.headline.topPx + t1gap.headline.fontPx)
ok("T1 gap reduced to 24px (tighter lockup, was 35)", t1GapPx === 24)
ok("T3 detail gap (18) is still TIGHTER than T1 (24)", (t3gap.detail!.topPx - (t3gap.headline.topPx + t3gap.headline.fontPx)) < t1GapPx)
ok("T8 with no price → no detail block (omitted)", computeOverlayLayout("pov_price", "POV: You upgraded to a loft", "").detail === null)
// Guardrails: Template 1 stays 52, Template 3 stays the shared sub size.
ok("Template 1 detail STAYS 52px", computeOverlayLayout("market_type", "SAN ANTONIO LOFTS", "Starting at $1,900/mo").detail!.fontPx === 52)
ok("Template 3 detail UNCHANGED (shared sub size)", computeOverlayLayout("special_feature", "SAN ANTONIO LOFTS", "8 Weeks Free · Private Yards").detail!.fontPx === OVERLAY_SPEC.sub.fontPx)

console.log(`\nComposer unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
