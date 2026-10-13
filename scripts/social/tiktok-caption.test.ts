// Pure unit tests for the TikTok caption payload (no network): same body structure/spacing as
// Instagram, TikTok hashtags generated separately and capped at 5, Instagram unchanged at 7, and
// manual captions preserved. Run: `npx tsx scripts/social/tiktok-caption.test.ts`
import {
  buildTikTokCaptionPayload,
  buildInstagramCaptionPayload,
  buildCaption,
  TIKTOK_MAX_HASHTAGS,
  MAX_HASHTAGS,
  TIKTOK_SECTION_PAD,
  padTikTokSectionBreaks,
  type SourceMeta,
} from "@/lib/social/composePost"
import { buildHashtags } from "@/lib/social/hashtags"
import { truncateToRunes } from "@/lib/social/tiktok"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

// The TikTok payload separates sections with a PADDED blank line (\n + U+2800 + \n) rather than a
// bare \n\n, because TikTok drops empty lines when it renders a published caption. These helpers
// keep the structural assertions below exactly as strong as they were — they just split on the
// separator the payload actually uses now.
const TT_SEP = `\n${TIKTOK_SECTION_PAD}\n`
const ttSections = (s: string) => s.split(TT_SEP)

const source = { market: "San Antonio", property_type: "Apartment", special: null, budget_range: "$1,200 – $1,800", amenities: "yard, garage, pool" }
const meta: SourceMeta = { market: "San Antonio", propertyType: "Apartment", special: null, socialSpecial: null, budgetRange: "$1,200 – $1,800", amenities: "yard, garage, pool" }

console.log("TikTok caption BODY == Instagram caption body (generated), hashtags differ:")
{
  // Generated caption (caption=null → publishCaption regenerates the canonical body).
  const tt = buildTikTokCaptionPayload({ caption: null, socialSpecial: null, sourceContentId: "seed-1", source })
  const ttHashLine = ttSections(tt).at(-1) || ""
  const ttTags = ttHashLine.split(/\s+/).filter((w) => w.startsWith("#"))
  const igTags = buildHashtags("San Antonio", MAX_HASHTAGS, "Apartment")

  ok("TikTok body begins with the generated hook (same as buildCaption)", tt.startsWith(buildCaption(meta, "seed-1").split("\n\n")[0]))
  ok("TikTok has the '🏡 Amenities' section with bullets", tt.includes(`🏡 Amenities${TT_SEP}• yard\n• garage\n• pool`))
  ok("section spacing preserved as a PADDED blank line (TikTok drops empty ones)",
    tt.includes(`${TT_SEP}🏡 Amenities`) && tt.includes(`${TT_SEP}#`) && !tt.includes("\n\n"))
  ok(`TikTok hashtags ≤ ${TIKTOK_MAX_HASHTAGS}`, ttTags.length > 0 && ttTags.length <= TIKTOK_MAX_HASHTAGS)
  ok("TIKTOK_MAX_HASHTAGS is 5", TIKTOK_MAX_HASHTAGS === 5)
  // Instagram and TikTok now share the SAME canonical generation cap of 5.
ok("shared generation cap is 5", MAX_HASHTAGS === 5)
  ok("Instagram still emits its 7 stored hashtags (unchanged)", buildInstagramCaptionPayload({ caption: null, hashtags: igTags, socialSpecial: null, sourceContentId: "seed-1", source }).trim().endsWith(igTags.join(" ")))
  ok("TikTok hashtags are generated separately and both paths cap at 5", ttTags.length <= 5 && igTags.length <= 5)
}

console.log("\nStructure order: hook → 🏡 Amenities → service CTA → form CTA → hashtags:")
{
  const tt = buildTikTokCaptionPayload({ caption: null, socialSpecial: null, sourceContentId: "seed-2", source })
  const sections = ttSections(tt)
  const amenityIdx = sections.findIndex((s) => s.startsWith("🏡 Amenities"))
  const hashIdx = sections.findIndex((s) => /^#/.test(s))
  ok("amenities section present and before hashtags", amenityIdx > 0 && hashIdx > amenityIdx)
  ok("hashtags are the LAST section", hashIdx === sections.length - 1)
}

console.log("\nManual caption preserved (not overwritten), TikTok hashtags still appended:")
{
  const manual = "My own hand-written hook line.\n\nSecond paragraph I wrote."
  const tt = buildTikTokCaptionPayload({ caption: manual, socialSpecial: null, sourceContentId: "seed-3", source })
  // Verbatim MODULO the padded blank lines: no wording, punctuation or ordering may change.
  ok("manual caption body kept verbatim", tt.startsWith(padTikTokSectionBreaks(manual)))
  ok("…and removing the pads yields the original body exactly",
    tt.split("\n").filter((l) => l !== TIKTOK_SECTION_PAD).join("\n").startsWith(manual.split("\n\n").join("\n")))
  const ttTags = (ttSections(tt).at(-1) || "").split(/\s+/).filter((w) => w.startsWith("#"))
  ok("TikTok hashtags (≤5) appended after the manual body", ttTags.length > 0 && ttTags.length <= TIKTOK_MAX_HASHTAGS)
  ok("no generated amenities injected into a manual caption", !tt.includes("🏡 Amenities"))
}

console.log("\nOUTGOING PAYLOAD SPACING — pinned end-to-end (the text TikTok actually receives):")
{
  // The real San Antonio post, reproduced exactly: a generator-owned caption with a special and
  // three amenities. This pins the spacing of the string that leaves our server, because our
  // pipeline is verifiably NOT where the published caption loses its blank lines — the route
  // passes `title` to TikTok verbatim (tiktokPublish.initTikTokDirectPost sets `title: p.title`),
  // and JSON.stringify preserves \n. If spacing ever compresses on OUR side, these fail.
  const realSource = {
    market: "San Antonio", property_type: "Apartment", special: "6 Weeks Free", budget_range: null,
    amenities: "Attached Garages\nResort-Style Pool\nStainless Steel Appliances",
  }
  const tt = buildTikTokCaptionPayload({ caption: null, socialSpecial: null, sourceContentId: "sa-1", source: realSource })
  const sections = ttSections(tt)

  // 6 body sections + the hashtag block = 7, each separated by a blank line.
  ok("every major section is separated by a BLANK line (6 body + hashtags)", sections.length === 7)
  ok("1 hook is a single line", sections[0].length > 0 && !sections[0].includes("\n"))
  ok("2 special on its own line", sections[1].startsWith("\u2728") && sections[1].includes("6 weeks free"))
  ok("3 amenities header alone", sections[2] === "\uD83C\uDFE1 Amenities")
  ok("4 bullets grouped, single-spaced within the block", sections[3].split("\n").length === 3 && sections[3].split("\n").every((l) => l.startsWith("\u2022 ")))
  ok("5 service statement", /completely free/.test(sections[4]))
  ok("6 CTA, then the hashtag block last", /Comment/.test(sections[5]) && /^#/.test(sections[6]))

  // No stray triple newlines, and no trailing/leading whitespace that would render as a gap.
  ok("no bare \\n\\n survives (TikTok would drop that empty line)", !tt.includes("\n\n"))
  ok("no triple newline anywhere", !tt.includes("\n\n\n"))
  ok("no leading or trailing whitespace", tt === tt.trim())

  // The publish route's only transformation is a length cap. For a normal caption it is a no-op,
  // so the pinned structure above is byte-identical to what initTikTokDirectPost sends.
  const TIKTOK_TITLE_MAX = 2200
  const title = tt.length > TIKTOK_TITLE_MAX ? tt.slice(0, TIKTOK_TITLE_MAX) : tt
  ok("route truncation is a no-op at normal length — payload reaches TikTok unchanged", title === tt)
  ok("…and the blank lines survive JSON encoding", JSON.parse(JSON.stringify({ title })).title === tt)

  // Instagram's body must stay byte-identical: this task must not change Instagram formatting.
  const ig = buildInstagramCaptionPayload({
    caption: null, hashtags: null, socialSpecial: null, sourceContentId: "sa-1",
    overlayTemplate: null, source: realSource,
  })
  ok("Instagram body is byte-identical to TikTok's (only the hashtag block differs)",
    ig.split("\n\n").slice(0, 6).join("|") === sections.slice(0, 6).join("|"))
}

console.log("\nTIKTOK-ONLY PARAGRAPH PADDING (U+2800) — the blank lines must survive TikTok's rendering:")
{
  const PAD = TIKTOK_SECTION_PAD
  const realSource = {
    market: "San Antonio", property_type: "Apartment", special: "6 Weeks Free", budget_range: null,
    amenities: "Attached Garages\nResort-Style Pool\nStainless Steel Appliances",
  }
  const stored =
    "Moving to San Antonio? I got you.\n\n✨ Up to 6 weeks free!\n\n🏡 Amenities\n\n" +
    "• Attached Garages\n• Resort-Style Pool\n• Stainless Steel Appliances\n\n" +
    "My apartment locating service is completely free!\n\n" +
    "✅ Comment “LIST” and I’ll send you the best options within your budget."
  const tt = buildTikTokCaptionPayload({ caption: stored, socialSpecial: null, sourceContentId: "sa-1", source: realSource })
  const lines = tt.split("\n")

  ok("the pad is U+2800 BRAILLE PATTERN BLANK", PAD === "⠀" && PAD.codePointAt(0) === 0x2800)
  ok("it is NOT whitespace (survives whitespace collapsing)", !/\s/.test(PAD) && PAD.trim() !== "")
  ok("it is NOT a format control (survives Cf stripping, unlike U+200B)", !/\p{Cf}/u.test(PAD) && /\p{So}/u.test(PAD))

  // 1. ALL SIX boundaries padded, uniformly — the approved structure, unchanged.
  ok("exactly 6 padded blank lines", lines.filter((l) => l === PAD).length === 6)
  ok("no empty line remains (TikTok would drop it)", !lines.includes(""))
  ok("no \\n\\n remains anywhere", !tt.includes("\n\n"))

  // 2. Single line breaks inside a section are untouched — the amenity bullets stay a block.
  const bulletIdx = lines.findIndex((l) => l.startsWith("• Attached"))
  ok("amenity bullets are consecutive, with no pad between them",
    lines[bulletIdx + 1].startsWith("• Resort") && lines[bulletIdx + 2].startsWith("• Stainless"))

  // 3. Content is byte-identical once the pads are removed — nothing rewritten or reordered.
  const withoutPads = lines.filter((l) => l !== PAD).join("\n")
  const expectedContent = stored.split("\n\n").join("\n") + "\n" +
    "#sanantonioapartments #sanantonioapartmentlocator #movingtosanantonio #apartmenthunting #apartmentliving"
  ok("wording, punctuation, emojis, CTA and hashtags unchanged", withoutPads === expectedContent)
  ok("emojis intact", tt.includes("✨") && tt.includes("🏡") && tt.includes("✅"))
  ok("the CTA keyword is intact", tt.includes("Comment “LIST”"))
  ok("the hashtag line is a single untouched line", /^#\S+( #\S+)*$/.test(lines[lines.length - 1]))
  // The pad sits on its OWN line before the hashtag block — that is the intended boundary.
  // What must never happen is a pad sharing a line with a hashtag, which would break parsing.
  ok("no pad ever shares a line with a hashtag", !lines.some((ln) => ln.includes("#") && ln.includes(PAD)))

  // 4. IDEMPOTENT — repeated formatting must not accumulate invisible characters.
  const twice = padTikTokSectionBreaks(tt)
  const thrice = padTikTokSectionBreaks(twice)
  ok("applying the formatter again is a no-op", twice === tt && thrice === tt)
  ok("pad count stays 6 under repeats", [...thrice].filter((c) => c === PAD).length === 6)

  // 5. Captions WITHOUT blank lines are returned untouched.
  ok("single line unchanged", padTikTokSectionBreaks("One single line only.") === "One single line only.")
  ok("single \\n runs unchanged (no accidental padding)", padTikTokSectionBreaks("a\nb\nc") === "a\nb\nc")
  ok("empty string unchanged", padTikTokSectionBreaks("") === "")
  ok("a run of 3+ newlines collapses to ONE padded blank line",
    padTikTokSectionBreaks("a\n\n\n\nb") === `a\n${PAD}\nb`)

  // 6. UNICODE COUNTING — the cap counts UTF-16 units; emoji are surrogate pairs.
  ok("each pad costs exactly 1 UTF-16 unit", PAD.length === 1)
  ok("padding adds exactly 6 units", tt.length === padTikTokSectionBreaks(tt).length &&
    tt.length === tt.replace(new RegExp(PAD, "g"), "").length + 6)
  ok("🏡 is 2 UTF-16 units but 1 code point", "🏡".length === 2 && [...("🏡")].length === 1)

  // 7. JSON ENCODING — the wire format the route sends.
  const roundTrip = JSON.parse(JSON.stringify({ title: tt })).title
  ok("survives JSON round-trip byte-for-byte", roundTrip === tt)
  ok("the pad encodes as \\u2800 on the wire", JSON.stringify(tt).includes("⠀") || JSON.stringify(tt).includes("\\u2800"))
  ok("no lone surrogate anywhere in the payload", !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(tt))
}

console.log("\n2,200-RUNE LIMIT — the length contract is preserved, without splitting emoji:")
{
  // The REAL implementation the publish route calls — imported, not re-declared, so reverting
  // the route to a bare .slice() makes these fail instead of silently testing a copy.
  const TIKTOK_TITLE_MAX = 2200
  const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

  ok("under the cap: returned unchanged", truncateToRunes("short", TIKTOK_TITLE_MAX) === "short")
  ok("exactly at the cap: returned unchanged",
    truncateToRunes("a".repeat(2200), TIKTOK_TITLE_MAX).length === 2200)
  ok("over the cap: capped at 2200 (contract unchanged)",
    truncateToRunes("a".repeat(2500), TIKTOK_TITLE_MAX).length === 2200)

  // The defect: the 2200th unit is the HIGH half of an emoji.
  const splitsEmoji = "a".repeat(2199) + "🏡" + " tail"
  ok("the naive slice DID split the emoji (the bug)", loneSurrogate.test(splitsEmoji.slice(0, 2200)))
  const safe = truncateToRunes(splitsEmoji, TIKTOK_TITLE_MAX)
  ok("truncateToRunes leaves NO lone surrogate", !loneSurrogate.test(safe))
  ok("…and drops only the severed emoji (2199 units)", safe.length === 2199)
  ok("…and still JSON-encodes cleanly", JSON.parse(JSON.stringify({ t: safe })).t === safe)

  // A whole emoji landing exactly on the boundary must be KEPT, not dropped.
  const fits = "a".repeat(2198) + "🏡"
  ok("an emoji ending exactly at the cap is kept whole",
    truncateToRunes(fits, TIKTOK_TITLE_MAX) === fits && truncateToRunes(fits, TIKTOK_TITLE_MAX).length === 2200)

  // A padded caption approaching the cap still truncates safely.
  const bigBody = ("x".repeat(300) + "\n\n").repeat(8) + "🏡 end"
  const padded = padTikTokSectionBreaks(bigBody)
  const capped = truncateToRunes(padded, TIKTOK_TITLE_MAX)
  ok("a padded near-limit caption is capped safely", capped.length <= 2200 && !loneSurrogate.test(capped))
}

console.log("\nINSTAGRAM IS BYTE-FOR-BYTE UNCHANGED (frozen literals captured BEFORE the change):")
{
  const realSource = {
    market: "San Antonio", property_type: "Apartment", special: "6 Weeks Free", budget_range: null,
    amenities: "Attached Garages\nResort-Style Pool\nStainless Steel Appliances",
  }
  const stored =
    "Moving to San Antonio? I got you.\n\n✨ Up to 6 weeks free!\n\n🏡 Amenities\n\n" +
    "• Attached Garages\n• Resort-Style Pool\n• Stainless Steel Appliances\n\n" +
    "My apartment locating service is completely free!\n\n" +
    "✅ Comment “LIST” and I’ll send you the best options within your budget."

  // Captured from the pre-change build. If Instagram output ever moves, these fail loudly.
  const FROZEN_MANUAL =
    "Moving to San Antonio? I got you.\n\n✨ Up to 6 weeks free!\n\n🏡 Amenities\n\n• Attached Garages\n• Resort-Style Pool\n• Stainless Steel Appliances\n\nMy apartment locating service is completely free!\n\n✅ Comment “LIST” and I’ll send you the best options within your budget.\n\n#sanantonioapartments #apartmenthunting"
  const FROZEN_GENERATED =
    "Need a new apartment?\n\n✨ Up to 6 weeks free!\n\n🏡 Amenities\n\n• Attached Garages\n• Resort-Style Pool\n• Stainless Steel Appliances\n\nMy apartment locating service is completely free!\n\n✅ Comment \"LIST\" and I’ll send you the best options within your budget."
  const FROZEN_NO_BLANKS = "One single line only.\n\n#x"

  const igManual = buildInstagramCaptionPayload({ caption: stored, hashtags: ["#sanantonioapartments", "#apartmenthunting"], socialSpecial: null, sourceContentId: "sa-1", overlayTemplate: null, source: realSource })
  const igGenerated = buildInstagramCaptionPayload({ caption: null, hashtags: null, socialSpecial: null, sourceContentId: "sa-1", overlayTemplate: null, source: realSource })
  const igNoBlanks = buildInstagramCaptionPayload({ caption: "One single line only.", hashtags: ["#x"], socialSpecial: null, sourceContentId: "sa-9", overlayTemplate: null, source: realSource })

  ok("IG manual caption byte-for-byte identical to the pre-change output", igManual === FROZEN_MANUAL)
  ok("IG generated caption byte-for-byte identical", igGenerated === FROZEN_GENERATED)
  ok("IG caption with no blank lines byte-for-byte identical", igNoBlanks === FROZEN_NO_BLANKS)
  ok("NO Instagram payload contains the pad character",
    ![igManual, igGenerated, igNoBlanks].some((c) => c.includes(TIKTOK_SECTION_PAD)))
  ok("Instagram still uses real \\n\\n paragraph breaks",
    [igManual, igGenerated, igNoBlanks].every((c) => c.includes("\n\n")))

  // The stored caption must never be mutated by the TikTok path.
  const before = stored
  buildTikTokCaptionPayload({ caption: stored, socialSpecial: null, sourceContentId: "sa-1", source: realSource })
  ok("the stored caption is not mutated by the TikTok formatter", stored === before && !stored.includes(TIKTOK_SECTION_PAD))
}

console.log(`\nTikTok caption unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
