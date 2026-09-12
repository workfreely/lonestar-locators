// Focused unit tests for the Post Composer's auto-preparation + hashtag bank + render args.
// Pure logic only — no network, no ffmpeg. Run: npx tsx scripts/social/composer.test.ts
import { buildHashtags, normalizeHashtag, HASHTAG_MARKETS } from "@/lib/social/hashtags"
import { preparePost, buildCaption, buildOverlayHeadline, buildOverlaySubheadline, composeFinalCaption } from "@/lib/social/composePost"
import { buildFfmpegArgs, buildVideoFilter } from "@/lib/social/renderVideo"

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

console.log("auto-prepare (public-safe; no internal notes):")
const src = { propertyName: "Alta Westover Hills", market: "San Antonio", special: "1 Month Free", budgetRange: "$1,200–$1,600", amenities: "Pool, Gym" }
const prep = preparePost(src)
ok("headline = property, uppercased", prep.overlayHeadline === "ALTA WESTOVER HILLS")
ok("subheadline = special", prep.overlaySubheadline === "1 Month Free")
ok("caption includes property + market", prep.caption.includes("Alta Westover Hills") && prep.caption.includes("San Antonio"))
ok("caption includes special + budget + amenities", prep.caption.includes("1 Month Free") && prep.caption.includes("$1,200") && prep.caption.includes("Pool, Gym"))
ok("caption has 7–10 hashtags prepared separately", prep.hashtags.length >= 7 && prep.hashtags.length <= 10)
ok("Dallas market → DFW NOT substituted in headline/caption", buildOverlayHeadline({ propertyName: null, market: "Dallas" }) === "DALLAS")
// PRIVACY: notes are never accepted into the SourceMeta type, so they can't leak. Confirm a
// caption from bare market doesn't invent internal detail.
ok("no property → 'Now leasing in <market>'", buildCaption({ market: "Austin" }).startsWith("Now leasing in Austin"))
ok("subheadline empty when no special and no property", buildOverlaySubheadline({ market: "Austin" }) === "")
ok("final caption appends hashtags", composeFinalCaption("Hello", ["#a", "#b"]) === "Hello\n\n#a #b")

console.log("ffmpeg arg builder (Reel-safe encoders):")
const filt = buildVideoFilter("/f/font.ttf", "/w/head.txt", null)
ok("filter fills to 1080x1920 then crops", filt.includes("scale=1080:1920:force_original_aspect_ratio=increase") && filt.includes("crop=1080:1920"))
ok("filter draws headline when present", filt.includes("drawtext") && filt.includes("head.txt"))
ok("no sub drawtext when sub null", (filt.match(/drawtext/g) || []).length === 1)
const args = buildFfmpegArgs({ sourcePath: "/s.mp4", outputPath: "/o.mp4", filter: filt, audioChoice: "original" })
ok("H.264 + yuv420p + faststart + AAC", args.includes("libx264") && args.includes("yuv420p") && args.includes("+faststart") && args.includes("aac"))
ok("audio 'none' → -an (muted)", buildFfmpegArgs({ sourcePath: "/s", outputPath: "/o", filter: "x", audioChoice: "none" }).includes("-an"))

console.log(`\nComposer unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
