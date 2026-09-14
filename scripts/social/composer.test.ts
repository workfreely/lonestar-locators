// Focused unit tests for the Post Composer's auto-preparation + hashtag bank + render args.
// Pure logic only — no network, no ffmpeg. Run: npx tsx scripts/social/composer.test.ts
import { buildHashtags, normalizeHashtag, HASHTAG_MARKETS } from "@/lib/social/hashtags"
import { preparePost, buildCaption, buildOverlayHeadline, buildOverlaySubheadline, composeFinalCaption, startingPriceLabel } from "@/lib/social/composePost"
import { buildFfmpegArgs, buildVideoFilter } from "@/lib/social/renderVideo"
import { wrapHeadline, wrapSub, overlayPreviewStyle, headlineFit, OVERLAY_SPEC, HEADLINE_TEXT_AVAIL_PX } from "@/lib/social/overlaySpec"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

console.log("hashtag bank (Dallas vs DFW distinct; 7–10; ordered):")
ok("markets include Austin/Dallas/DFW/Houston/San Antonio", ["Austin","Dallas","DFW","Houston","San Antonio"].every((m) => HASHTAG_MARKETS.includes(m)))
const dallas = buildHashtags("Dallas", 8), dfw = buildHashtags("DFW", 8)
ok("Dallas tags != DFW tags (not merged)", JSON.stringify(dallas) !== JSON.stringify(dfw))
ok("Dallas has #dallasapartments", dallas.includes("#dallasapartments"))
ok("DFW has #dfwapartments and NOT #dallasapartments as first", dfw.includes("#dfwapartments") && dfw[0] !== "#dallasapartments")
ok("count within 7–10", dallas.length >= 7 && dallas.length <= 10)
ok("market tags come before general", dallas.indexOf("#dallasapartments") < dallas.indexOf("#apartmenthunting"))
ok("no duplicates", new Set(dallas.map((s) => s.toLowerCase())).size === dallas.length)
ok("San Antonio distinct market tags", buildHashtags("San Antonio", 7).includes("#sanantonioapartments"))
ok("unknown market still yields 7 from general", buildHashtags("Nowhere", 7).length === 7)

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
ok("caption includes special + price + amenities lines", prep.caption.includes("✨ 1 Month Free") && prep.caption.includes("💰 $1,200–$1,600") && prep.caption.includes("🏡 private yard, garage, pool"))
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
ok("✨ line present when special present", full.includes("\n✨ 8 weeks free"))
ok("🏡 amenities capped at 3, comma-separated, verbatim, no 4th", full.includes("\n🏡 Rooftop pool, fitness center, dog park") && !full.includes("sauna"))
ok("💰 line present when price present", full.includes("\n💰 Starting at $1,495"))
const noSpecial = buildCaption({ market: "Dallas", propertyType: "Townhome", amenities: "Private yard", budgetRange: "Starting at $1,895" }, "z")
ok("✨ line OMITTED entirely (emoji included) when special missing", !noSpecial.includes("✨"))
ok("🏡 single amenity when only one exists", noSpecial.includes("\n🏡 Private yard"))
const bare = buildCaption({ market: "Dallas", propertyType: "Townhome" }, "z")
ok("no 🏡/💰/✨ lines when none present", !bare.includes("🏡") && !bare.includes("💰") && !bare.includes("✨"))
// Fixed CTA — always, verbatim, no emoji, never rotated.
ok("fixed CTA present verbatim", full.includes("My apartment locating service is completely free!\nSubmit the form to get your free custom apartment list."))
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
// Padded special / price → trimmed, single space after emoji.
ok("' 8 weeks free ' → '✨ 8 weeks free' (trimmed)", buildCaption({ market: "Dallas", special: " 8 weeks free " }, "s0").includes("\n✨ 8 weeks free\n"))
ok("' Starting at $1,495 ' → '💰 Starting at $1,495' (trimmed)", buildCaption({ market: "Dallas", budgetRange: " Starting at $1,495 " }, "s0").includes("\n💰 Starting at $1,495\n"))
// Amenities with surrounding + inter-item whitespace → exact comma-separated list.
ok("messy amenities → '🏡 Rooftop pool, fitness center, dog park'", buildCaption({ market: "Dallas", amenities: "  Rooftop pool ,  fitness center , dog park  " }, "s0").includes("\n🏡 Rooftop pool, fitness center, dog park\n"))
// Whole-caption cleanliness with messy input: no double spaces, no trailing spaces on any line,
// no space-before-punctuation, and no blank/whitespace-only lines.
const messy = buildCaption({ market: "  Dallas  ", propertyType: "  Townhome  ", special: "  8 weeks free  ", budgetRange: "  Starting at $1,495  ", amenities: "  Rooftop pool ,  fitness center , dog park  " }, "s0")
ok("no double spaces anywhere in caption", !/ {2,}/.test(messy))
ok("no trailing whitespace on any line", messy.split("\n").every((l) => l === l.replace(/\s+$/, "")))
ok("no space before ? . or , (hook/detail punctuation)", !/\s[?,]/.test(messy) && !/\s\.(?=\s|$)/.test(messy))
ok("no blank / whitespace-only lines", messy.split("\n").every((l) => l.trim().length > 0))
// Missing optional fields must not create malformed spacing or empty lines.
const sparse = buildCaption({ market: "Dallas", propertyType: "Townhome" }, "s0")
ok("absent optional fields → no ✨/🏡/💰 lines, no empty lines", !sparse.includes("✨") && !sparse.includes("🏡") && !sparse.includes("💰") && sparse.split("\n").every((l) => l.trim().length > 0))
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
const TYPES = ["Studio", "Apartment", "High-Rise", "Townhome", "Rental Home", "Penthouse"]
let allOneLine = true, allInRange = true, aboveFloor = true
for (const c of CITIES) for (const t of TYPES) {
  const fit = headlineFit(buildOverlayHeadline({ market: c, propertyType: t }))
  if (fit.lines.length !== 1) allOneLine = false
  if (fit.fontPx < OVERLAY_SPEC.headline.minFontPx || fit.fontPx > OVERLAY_SPEC.headline.fontPx) allInRange = false
  if (fit.fontPx <= OVERLAY_SPEC.headline.minFontPx) aboveFloor = false
}
ok("EVERY supported city×type headline stays ONE line", allOneLine)
ok("every fit font is within [minFontPx, 94]", allInRange)
ok("no supported combo hits the minimum floor (never needs to wrap)", aboveFloor)
ok("a combo that fits keeps the MAX 94px (DALLAS HIGH-RISES)", headlineFit("DALLAS HIGH-RISES").fontPx === 94)
ok("longest combo shrinks to 71px, still one line (SAN ANTONIO RENTAL HOMES)", headlineFit("SAN ANTONIO RENTAL HOMES").fontPx === 71 && headlineFit("SAN ANTONIO RENTAL HOMES").lines.length === 1)
ok("SAN ANTONIO APARTMENTS → 76px", headlineFit("SAN ANTONIO APARTMENTS").fontPx === 76)
ok("SAN ANTONIO HIGH-RISES → 83px", headlineFit("SAN ANTONIO HIGH-RISES").fontPx === 83)
ok("SAN ANTONIO TOWNHOMES → 77px", headlineFit("SAN ANTONIO TOWNHOMES").fontPx === 77)
ok("usable text width = safe area − box borders = 752px", HEADLINE_TEXT_AVAIL_PX === 752)
ok("unknown/custom headline falls back to base 94px + char-wrap", headlineFit("SOME ENTIRELY CUSTOM HEADLINE TEXT").fontPx === OVERLAY_SPEC.headline.fontPx)

console.log("Template 1 vertical lockup: tightened headline→sub gap:")
ok("gap is 35px (tightened from 44)", OVERLAY_SPEC.sub.gapPx === 35)
ok("a smaller (fit) headline font pulls the sub UP", overlayPreviewStyle(1, 71).subTopPct < overlayPreviewStyle(1, 94).subTopPct)

console.log("ffmpeg arg builder (Reel-safe encoders):")
const filt = buildVideoFilter("/f/font.ttf", "/w/head.txt", null)
ok("filter fills to 1080x1920 then crops", filt.includes("scale=1080:1920:force_original_aspect_ratio=increase") && filt.includes("crop=1080:1920"))
ok("filter draws headline when present", filt.includes("drawtext") && filt.includes("head.txt"))
ok("no sub drawtext when sub null", (filt.match(/drawtext/g) || []).length === 1)
const args = buildFfmpegArgs({ sourcePath: "/s.mp4", outputPath: "/o.mp4", filter: filt, audioChoice: "original" })
ok("H.264 + yuv420p + faststart + AAC", args.includes("libx264") && args.includes("yuv420p") && args.includes("+faststart") && args.includes("aac"))
ok("audio 'none' → -an (muted)", buildFfmpegArgs({ sourcePath: "/s", outputPath: "/o", filter: "x", audioChoice: "none" }).includes("-an"))

console.log("overlay collision (sub below the full headline block; preview === render):")
ok("long headline wraps to 2 lines", wrapHeadline("SAN ANTONIO HOMES").length === 2)
ok("short headline stays 1 line", wrapHeadline("SAN ANTONIO").length === 1)
// FFmpeg: the sub's y-offset must grow when the headline occupies more lines.
const subY = (n: number) => { const f = buildVideoFilter("/f.ttf", "/h.txt", "/s.txt", n); const m = f.match(/textfile='\/s\.txt'[^,]*y=h\*[0-9.]+\+([0-9.]+)/); return m ? parseFloat(m[1]) : NaN }
ok("2-line headline pushes the sub further down than 1-line", subY(2) > subY(1))
// Preview shares the same geometry: subTopPct increases with line count.
ok("preview sub position grows with headline lines", overlayPreviewStyle(2).subTopPct > overlayPreviewStyle(1).subTopPct)

console.log("subheadline width constraint (compact centered block; preview === render):")
ok("no sub → no lines", wrapSub("").length === 0)
ok("short sub → one line", wrapSub("PRIVATE YARDS").length === 1)
ok("long sub wraps to a multi-line block", wrapSub("PRIVATE YARDS + GARAGES + RESORT POOL + GATED ENTRY + WALK-IN CLOSETS").length >= 2)
ok("sub box now uses MORE width than the headline box (wider, less inset)", overlayPreviewStyle(1).subSideMarginPct < overlayPreviewStyle(1).sideMarginPct)
ok("sub box still keeps safe margins (never edge-to-edge)", overlayPreviewStyle(1).subSideMarginPct >= 6)
ok("a normal long sentence now fits on fewer lines than the old narrow box", wrapSub("Now leasing brand new luxury apartments").length <= 2)
ok("'8 WEEKS FREE' is a single line", wrapSub("8 WEEKS FREE").length === 1)
ok("'8 WEEKS FREE + WAIVED APP & ADMIN' now fits on ONE line (wider box)", wrapSub("8 WEEKS FREE + WAIVED APP & ADMIN").length === 1)
ok("sub is capped at maxLines (never runaway)", wrapSub("one two three four five six seven eight nine ten eleven twelve thirteen fourteen").length <= 4)
// FFmpeg render wraps the sub the same way (newlines in the sub textfile driver would be the file
// content; here we assert the sub drawtext carries line_spacing for the multi-line block).
ok("render sub drawtext has line_spacing (multi-line ready)", /textfile='\/s\.txt'[^,]*line_spacing=/.test(buildVideoFilter("/f.ttf", "/h.txt", "/s.txt", 1)))

console.log("Reels-safe boxes (generous margins; no-space text can't run off-screen):")
ok("headline box has generous side margins (not edge-to-edge)", overlayPreviewStyle(1).sideMarginPct >= 12)
ok("sub box is wider than the headline box but still safely inset", overlayPreviewStyle(1).subSideMarginPct < overlayPreviewStyle(1).sideMarginPct && overlayPreviewStyle(1).subSideMarginPct >= 6)
// Nonsense/no-space text must hard-break so no single line can overflow the box.
const noSpaceH = wrapHeadline("X".repeat(60))
ok("no-space headline hard-splits (every line ≤ maxChars)", noSpaceH.length > 0 && noSpaceH.every((l) => l.length <= 14))
ok("no-space headline still capped at maxLines", noSpaceH.length <= 3)
const noSpaceS = wrapSub("Y".repeat(120))
ok("no-space subheadline hard-splits (every line ≤ maxChars)", noSpaceS.length > 0 && noSpaceS.every((l) => l.length <= 33))
ok("two-line headline still wraps to 2", wrapHeadline("SAN ANTONIO HOMES").length === 2)

console.log(`\nComposer unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
