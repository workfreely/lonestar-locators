// Focused unit tests for the Post Composer's auto-preparation + hashtag bank + render args.
// Pure logic only — no network, no ffmpeg. Run: npx tsx scripts/social/composer.test.ts
import { buildHashtags, normalizeHashtag, HASHTAG_MARKETS } from "@/lib/social/hashtags"
import { preparePost, buildCaption, buildOverlayHeadline, buildOverlaySubheadline, composeFinalCaption } from "@/lib/social/composePost"
import { buildFfmpegArgs, buildVideoFilter } from "@/lib/social/renderVideo"
import { wrapHeadline, overlayPreviewStyle } from "@/lib/social/overlaySpec"

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
const prep = preparePost(src)
ok("headline = MARKET + TYPE (not property name)", prep.overlayHeadline === "SAN ANTONIO TOWNHOMES")
ok("subheadline = special when present", prep.overlaySubheadline === "1 Month Free")
ok("caption leads with market + type, not property", prep.caption.startsWith("Now leasing — San Antonio townhomes"))
ok("caption includes special + price + features", prep.caption.includes("1 Month Free") && prep.caption.includes("$1,200") && prep.caption.includes("private yard"))
ok("caption has 7–10 hashtags prepared separately", prep.hashtags.length >= 7 && prep.hashtags.length <= 10)
// Even if a property name were somehow supplied, the type-level SourceMeta drops it — verify no
// internal identity leaks into the public copy.
const leaky = preparePost({ market: "San Antonio", propertyType: "Townhome", amenities: "private yard, garage, pool", ...( { propertyName: "Botanica Oak Hills", areaNeighborhood: "Medical Center", notes: "call owner" } as unknown as object) })
ok("internal property name never leaks into caption", !leaky.caption.includes("Botanica"))
ok("internal area never leaks into caption/overlay", !leaky.caption.includes("Medical Center") && !leaky.overlayHeadline.includes("MEDICAL") && !leaky.overlaySubheadline.includes("MEDICAL"))
ok("internal notes never leak", !leaky.caption.includes("call owner"))

console.log("subheadline priority: special → features → price → empty:")
ok("no special → features hook (pluralized, uppercased)", buildOverlaySubheadline({ market: "San Antonio", amenities: "private yard, garage, pool" }) === "PRIVATE YARDS + GARAGES")
ok("no special/features → price range", buildOverlaySubheadline({ market: "Dallas", budgetRange: "$1,500+" }) === "$1,500+")
ok("nothing public → empty", buildOverlaySubheadline({ market: "Austin" }) === "")

console.log("headline market/type fallbacks:")
ok("Dallas market → DFW NOT substituted", buildOverlayHeadline({ market: "Dallas" }) === "DALLAS APARTMENTS")
ok("market only → market + apartments", buildOverlayHeadline({ market: "Austin" }) === "AUSTIN APARTMENTS")
ok("no market → 'Now leasing in <market>' absent, generic tour", buildCaption({}).startsWith("New apartment tour"))
ok("final caption appends hashtags", composeFinalCaption("Hello", ["#a", "#b"]) === "Hello\n\n#a #b")

console.log("ffmpeg arg builder (Reel-safe encoders):")
const filt = buildVideoFilter("/f/font.ttf", "/w/head.txt", null)
ok("filter fills to 1080x1920 then crops", filt.includes("scale=1080:1920:force_original_aspect_ratio=increase") && filt.includes("crop=1080:1920"))
ok("filter draws headline when present", filt.includes("drawtext") && filt.includes("head.txt"))
ok("no sub drawtext when sub null", (filt.match(/drawtext/g) || []).length === 1)
const args = buildFfmpegArgs({ sourcePath: "/s.mp4", outputPath: "/o.mp4", filter: filt, audioChoice: "original" })
ok("H.264 + yuv420p + faststart + AAC", args.includes("libx264") && args.includes("yuv420p") && args.includes("+faststart") && args.includes("aac"))
ok("audio 'none' → -an (muted)", buildFfmpegArgs({ sourcePath: "/s", outputPath: "/o", filter: "x", audioChoice: "none" }).includes("-an"))

console.log("overlay collision (sub below the full headline block; preview === render):")
ok("long headline wraps to 2 lines", wrapHeadline("SAN ANTONIO LUXURY TOWNHOMES").length === 2)
ok("short headline stays 1 line", wrapHeadline("SAN ANTONIO").length === 1)
// FFmpeg: the sub's y-offset must grow when the headline occupies more lines.
const subY = (n: number) => { const f = buildVideoFilter("/f.ttf", "/h.txt", "/s.txt", n); const m = f.match(/textfile='\/s\.txt'[^,]*y=h\*[0-9.]+\+([0-9.]+)/); return m ? parseFloat(m[1]) : NaN }
ok("2-line headline pushes the sub further down than 1-line", subY(2) > subY(1))
// Preview shares the same geometry: subTopPct increases with line count.
ok("preview sub position grows with headline lines", overlayPreviewStyle(2).subTopPct > overlayPreviewStyle(1).subTopPct)

console.log(`\nComposer unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
