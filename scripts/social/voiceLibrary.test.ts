/**
 * THE VOICE CLIP LIBRARY — classification, loudness and the pairing rules.
 *
 *   npx tsx scripts/social/voiceLibrary.test.ts
 *
 * What is worth proving here is mostly REFUSAL. Classifying a filename correctly is pleasant;
 * refusing to pair a San Antonio hook with Dallas footage, or a "$1,500 gets you" claim with a
 * property renting at $2,400, is what keeps a false statement out of a video a renter watches.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  parseVoiceClip, parseMarket, parsePriceToken, isClipCompatible,
  VOICE_MARKETS, VOICE_CATEGORIES, CTA_PROPERTY_TYPES, PRICE_BAND_FLOOR, PRICE_BAND_TOLERANCE,
  priceClaimKind, isAutoEligible,
  classifyFromTranscript, ELIGIBILITY_TIERS, normalizePropertyType, type VoiceClipMeta,
} from "@/lib/social/voiceLibrary"
import {
  VOICE_NORMALIZE, parseLoudnorm, measureFilter, applyFilter, needsCompression, crestFactorDb,
} from "@/lib/social/voiceNormalize"
import { MASTER_LOUDNESS, masterMeasureFilter, masterApplyFilter, VOICE_MIX } from "@/lib/social/renderVideo"
import { COMMENT_KEYWORDS } from "@/lib/social/commentKeywords"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) } }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))

// ── 1. MARKET ─────────────────────────────────────────────────────────────────────────────────
console.log("market comes out of the filename:")
for (const [name, want] of [
  ["SATX_$1000_Gets_You.m4a", "SATX"],
  ["DAL_$2000_Gets_You.m4a", "DAL"],
  ["HOU_What_7K_Gets_You.m4a", "HOU"],
  ["Best deals in San Antonio.m4a", "SATX"],
  ["Moving_DAL_List_Tour.m4a", "DAL"],
  ["SATX_Looking_For_Luxury_Apt_List..m4a", "SATX"],
] as const) ok(`${name} → ${want}`, parseMarket(name).market === want)
// The bug this pins: "_" is a word character, so /\bSATX\b/ does NOT match SATX_$1000, and every
// price hook in the library was briefly classified as having no market at all.
ok("an underscore does not hide the market", parseMarket("SATX_$1000_Gets_You.m4a").market === "SATX")
ok("a name with no market reports none", parseMarket("CTA_Apartment_Budget.m4a").market === null)
ok("two markets in one name is a CONFLICT, not a tie-break", parseMarket("DAL_$2000_Gets_You_SATX.m4a").conflict)
ok("…and one market is not", !parseMarket("SATX_$2000_Gets_You.m4a").conflict)

// ── 2. PRICE ──────────────────────────────────────────────────────────────────────────────────
console.log("\nprices are read as monthly rent:")
for (const [tok, want] of [["$1000", 1000], ["1500", 1500], ["15K", 15000], ["$10K", 10000], ["25K", 25000], ["$1,800", 1800]] as const) {
  ok(`${tok} → ${want}`, parsePriceToken(tok) === want)
}
ok("a stray small number is not a rent", parsePriceToken("4") === null && parsePriceToken("02") === null)
ok("a word is not a price", parsePriceToken("Gets") === null)
console.log("\n…and the luxury band is read at full value, not mistaken for hundreds:")
for (const [f, want] of [["HOU_What_20K_Gets_You.m4a", 20000], ["DAL_What_25K_Gets_You.m4a", 25000], ["SATX_What_10K_Gets_You.m4a", 10000]] as const) {
  ok(`${f} → $${want.toLocaleString()}/month`, parseVoiceClip("03_Price Hooks", f).pricePoint === want)
}

// ── 3. CATEGORY AND CTA ───────────────────────────────────────────────────────────────────────
console.log("\nthe folder decides the category, with sub-themes inside Hooks:")
for (const [folder, file, want] of [
  ["01_Hooks", "Moving_SATX_List_Tour.m4a", "conversational_hook"],
  ["01_Hooks", "SATX_Looking_For_Luxury_Apt_List..m4a", "luxury_lifestyle"],
  ["01_Hooks", "DAL_Best_Apt_Deals_Right_Now.m4a", "best_deals"],
  ["02_CTA", "CTA_Penthouse_AmazingView.m4a", "call_to_action"],
  ["03_Price Hooks", "SATX_What_1500_Gets_You.m4a", "price_hook"],
  ["04-Specials", "One_Client_Got_8_Weeks_Free.m4a", "social_proof"],
] as const) ok(`${file} → ${want}`, parseVoiceClip(folder, file).category === want)
ok("only CTAs are clip_type cta", parseVoiceClip("02_CTA", "CTA_Apartment_Budget.m4a").clipType === "cta"
  && parseVoiceClip("01_Hooks", "Moving_DAL_List_Tour.m4a").clipType === "hook")

console.log("\nCTA keywords match the approved six, exactly:")
{
  const approved = COMMENT_KEYWORDS.filter((k) => k.propertyType).map((k) => k.keyword)
  for (const kw of Object.keys(CTA_PROPERTY_TYPES)) ok(`${kw} is an approved keyword`, approved.includes(kw))
  for (const [kw, type] of Object.entries(CTA_PROPERTY_TYPES)) {
    const live = COMMENT_KEYWORDS.find((k) => k.keyword === kw)
    ok(`${kw} → ${type} matches commentKeywords`, live?.propertyType === type)
  }
}
for (const [file, kw] of [
  ["CTA_Penthouse_AmazingView.m4a", "KEY"],
  ["CTA_HighRise_FloorToCeilingWindows.m4a", "RISE"],
  ["CTA_Townhome_Bugdet.m4a", "TOWN"],
  ["CTA_Industrial_Loft_Budget.m4a", "LOFT"],
  ["CTA_Apartment_Budget.m4a", "LIST"],
] as const) ok(`${file} → ${kw}`, parseVoiceClip("02_CTA", file).ctaKeyword === kw)
ok("a typo in the name does not break the mapping", parseVoiceClip("02_CTA", "CTA_Townhome_Bugdet.m4a").ctaKeyword === "TOWN")

// ── 4. REFUSAL ────────────────────────────────────────────────────────────────────────────────
console.log("\nambiguity is FLAGGED, never resolved by a rule:")
{
  const c = parseVoiceClip("03_Price Hooks", "DAL_$2000_Gets_You_SATX.m4a")
  ok("a two-market filename is flagged", c.review.some((r) => /more than one market/.test(r)))
  const p = parseVoiceClip("03_Price Hooks", "What_Gets_You.m4a")
  ok("a price hook with no price is flagged", p.review.some((r) => /no readable price/.test(r)))
  const n = parseVoiceClip("03_Price Hooks", "Some_Hook_1500.m4a")
  ok("a price hook with no city is flagged", n.review.some((r) => /must name its city/.test(r)))
  const t = parseVoiceClip("02_CTA", "CTA_Something_Vague.m4a")
  ok("a CTA naming no property type is flagged", t.review.some((r) => /no property type/.test(r)))
  ok("a clean filename is flagged for nothing", parseVoiceClip("03_Price Hooks", "SATX_$1500_Gets_You.m4a").review.length === 0)
}

// ── 5. COMPATIBILITY ──────────────────────────────────────────────────────────────────────────
const clip = (folder: string, file: string) => parseVoiceClip(folder, file)
// `rent` is the price THE VIDEO DISPLAYS — social_content.budget_range — not a catalog figure.
const prop = (market: string | null, rent: number | null, type: string | null = null, priceMode: "starting_at" | "exact_unit" = "starting_at") =>
  ({ market: market as never, startingRent: rent, priceMode, propertyType: type })

console.log("\na city hook never travels to another city:")
{
  const satx = clip("01_Hooks", "Moving_SATX_List_Tour.m4a")
  ok("SATX hook + SATX property → ok", isClipCompatible(satx, prop("SATX", 1500)).ok)
  const bad = isClipCompatible(satx, prop("DAL", 1500))
  ok("SATX hook + DAL property → REFUSED", !bad.ok)
  ok("…and says why", bad.reasons.some((r) => /San Antonio.*Dallas/.test(r)))
  ok("SATX hook + unknown market → refused", !isClipCompatible(satx, prop(null, 1500)).ok)
  const gen = clip("01_Hooks", "Looking_For_Townhome_This_For_You.m4a")
  ok("a GENERAL hook travels anywhere", isClipCompatible(gen, prop("DAL", 1500, "Townhome")).ok
    && isClipCompatible(gen, prop("HOU", 1500, "Townhome")).ok)
}

console.log("\na price claim must be TRUE of the price the video shows:")
{
  const c = clip("03_Price Hooks", "SATX_What_1500_Gets_You.m4a")
  ok('"$1,500 gets you" + a video showing $1,400 → ok', isClipCompatible(c, prop("SATX", 1400)).ok)
  ok("…+ a video showing exactly $1,500 → ok", isClipCompatible(c, prop("SATX", 1500)).ok)
  const over = isClipCompatible(c, prop("SATX", 2400))
  ok("…+ a video showing $2,400 → REFUSED", !over.ok)
  ok("…and quotes both numbers", over.reasons.some((r) => /\$1,500.*\$2,400/.test(r)))
  // NO PRICE IS NOT A CHEAP PRICE. A video nobody priced cannot support a spoken number.
  const unk = isClipCompatible(c, prop("SATX", null))
  ok("…+ a video with NO price entered → REFUSED", !unk.ok)
  ok("…and says the price is missing", unk.reasons.some((r) => /verified price/.test(r)))
  ok("…but a NON-price hook is unaffected by a missing price",
    isClipCompatible(clip("01_Hooks", "Moving_SATX_List_Tour.m4a"), prop("SATX", null)).ok)
}

console.log("\nan approximate claim must be CLOSE — 10%, not 60%:")
{
  const c = clip("03_Price Hooks", "SATX_What_1500_Gets_You.m4a")
  ok("the tolerance is a named, configurable constant", PRICE_BAND_TOLERANCE === 0.10)
  ok("$1,500 hook + a video showing $1,350 → ok (exactly at the tolerance)", isClipCompatible(c, prop("SATX", 1350)).ok)
  const just = isClipCompatible(c, prop("SATX", 1349))
  ok("$1,500 hook + a video showing $1,349 → refused (just outside)", !just.ok)
  ok("…and says so in percentage terms", just.reasons.some((r) => /10% tolerance/.test(r)))
  // The old 60% floor would have accepted every one of these. That was the point of tightening.
  ok("$1,500 hook + a video showing $900 → refused (the old floor allowed this)", !isClipCompatible(c, prop("SATX", 900)).ok)
  const k = clip("03_Price Hooks", "HOU_What_20K_Gets_You.m4a")
  ok("$20K hook + a video showing $19,000 → ok", isClipCompatible(k, prop("HOU", 19000)).ok)
  ok("$20K hook + a video showing $12,000 → refused (the old floor allowed this)", !isClipCompatible(k, prop("HOU", 12000)).ok)
  ok("$20K hook + a video showing $21,000 → refused (above the claim)", !isClipCompatible(k, prop("HOU", 21000)).ok)
  ok("$20K hook + an $1,800 apartment → still refused", !isClipCompatible(k, prop("HOU", 1800)).ok)
}

console.log("\nexact_unit means exactly — there is nothing to approximate:")
{
  const c = clip("03_Price Hooks", "SATX_What_1500_Gets_You.m4a")
  ok("$1,500 hook + exact unit shown at $1,500 → ok", isClipCompatible(c, prop("SATX", 1500, null, "exact_unit")).ok)
  const near = isClipCompatible(c, prop("SATX", 1450, null, "exact_unit"))
  ok("$1,500 hook + exact unit shown at $1,450 → REFUSED, though it is within 10%", !near.ok)
  ok("…and says the video shows an exact unit", near.reasons.some((r) => /exact unit/.test(r)))
  ok("…while the same pair passes under starting_at", isClipCompatible(c, prop("SATX", 1450)).ok)
}

console.log("\n'under $X' is a ceiling, and only a CONFIRMED transcript may say so:")
{
  const c = clip("03_Price Hooks", "SATX_What_1500_Gets_You.m4a")
  ok("an untranscribed price hook is treated as the STRICTER approximate claim", priceClaimKind(c) === "approximate")
  ok("…so a filename alone can never loosen the rule",
    priceClaimKind({ transcript: "under $1,500 a month", transcriptStatus: "missing" }) === "approximate")
  const ceiling = { ...c, transcript: "Here is what you can get for under $1,500 a month in San Antonio.", transcriptStatus: "confirmed" as const }
  ok("a confirmed 'under $X' transcript IS read as a ceiling", priceClaimKind(ceiling) === "under")
  ok("…and then a $900 video is fine, because $900 is under $1,500", isClipCompatible(ceiling, prop("SATX", 900)).ok)
  ok("…while $1,600 is still refused, because it is not under $1,500", !isClipCompatible(ceiling, prop("SATX", 1600)).ok)
  ok("…and the looser sanity floor still applies", !isClipCompatible(ceiling, prop("SATX", 500)).ok)
  ok("the ceiling floor is a named constant", PRICE_BAND_FLOOR === 0.6)
  const plain = { ...c, transcript: "Here is what $1,500 a month gets you in San Antonio.", transcriptStatus: "confirmed" as const }
  ok("a confirmed transcript WITHOUT 'under' stays approximate", priceClaimKind(plain) === "approximate")
  ok("…so $900 is still refused for it", !isClipCompatible(plain, prop("SATX", 900)).ok)
}

console.log("\nsocial proof is OFFERED, not applied — and is not blanket-restricted:")
for (const f of ["One_Client_Got_8_Weeks_Free.m4a", "Client_Got_4_Weeks_Free_Plus_Movers.m4a"]) {
  const c = clip("04-Specials", f)
  const auto = isAutoEligible(c, prop("SATX", 1200))
  ok(`${f} is NOT applied automatically`, !auto.ok)
  ok("…because a client experience cannot be verified from data", auto.reasons.some((x) => /genuine client experience/.test(x)))
  // The inverse error matters just as much: it must stay selectable where the claim is true.
  ok("…but it REMAINS manually selectable", isClipCompatible(c, prop("SATX", 1200)).ok)
}

console.log("\nthe bug this replaced — a folder is not a classification:")
{
  // "Help_Client_Amazing_Deal" sits in 01_Hooks and was treated as an ordinary conversational
  // hook: GENERAL, no price, no type, therefore compatible with everything. It was duly offered
  // for an Austin rental home. Its transcript says "I just helped my client get an amazing deal
  // on THIS apartment" — a claim about a real client and about the property on screen.
  const c = clip("01_Hooks", "Help_Client_Amazing_Deal.m4a")
  ok("its transcript is known and confirmed", c.transcriptStatus === "confirmed" && /helped my client/.test(c.transcript ?? ""))
  ok("the transcript makes it property_specific", c.eligibility === "property_specific")
  ok("…requiring a real client experience", c.requires.includes("verified_client_experience"))
  ok("…and that the featured property is the one described", c.requires.includes("featured_property_match"))
  const unrelated = prop(null, null)
  ok("it is NO LONGER auto-selected for an unrelated property", !isAutoEligible(c, unrelated).ok)
  ok("…but a person may still choose it where the claim is true", isClipCompatible(c, unrelated).ok)
}

console.log("\na missing transcript is a soft signal, never a block:")
{
  // Refusing every untranscribed clip emptied the library in testing — 57 of 58 have no
  // transcript, and "not transcribed yet" is not evidence of a false claim.
  const c = clip("03_Price Hooks", "SATX_What_1500_Gets_You.m4a")
  ok("it is marked missing", c.transcriptStatus === "missing")
  ok("…and is NOT pushed into review for it", !c.review.some((r) => /transcript/i.test(r)))
  ok("…and remains usable", isClipCompatible(c, prop("SATX", 1450)).ok)
  ok("a price claim is still auto-verifiable from the rent", isAutoEligible(c, prop("SATX", 1450)).ok)
  ok("…and still refused when the rent does not support it", !isAutoEligible(c, prop("SATX", 2400)).ok)
}

console.log("\na flagged clip is unusable until a person clears it:")
{
  const flagged: VoiceClipMeta = { ...clip("03_Price Hooks", "SATX_$1500_Gets_You.m4a"), review: ["needs a look"] }
  ok("flagged → refused", !isClipCompatible(flagged, prop("SATX", 1400)).ok)
}

console.log("\nproperty type is only checked when the clip names one:")
{
  const pent = clip("02_CTA", "CTA_Penthouse_AmazingView.m4a")
  ok("penthouse CTA + penthouse → ok", isClipCompatible(pent, prop("SATX", 9000, "Penthouse")).ok)
  ok("penthouse CTA + apartment → refused", !isClipCompatible(pent, prop("SATX", 9000, "Apartment")).ok)
  const plain = clip("01_Hooks", "Help_Client_Amazing_Deal.m4a")
  ok("a clip naming no type does not constrain the property", isClipCompatible(plain, prop("DAL", 1500, "Loft")).ok)
}

// ── 6. LOUDNESS ───────────────────────────────────────────────────────────────────────────────
console.log("\nthe clip target, and why it is what it is:")
ok("voice target is -16 LUFS", VOICE_NORMALIZE.targetLufs === -16)
// Two different numbers, and conflating them was the bug. loudnorm is ASKED for -2.0; the AAC
// encode then adds ~0.6 dB of intersample peak, so the STORED file is guaranteed under -1.0.
// Asking for -1.5 and calling the result a -1.5 file stored -0.87.
ok("loudnorm is asked for -2.0", VOICE_NORMALIZE.truePeakDb === -2.0)
ok("…and the stored-file guarantee is -1.0", VOICE_NORMALIZE.maxEncodedTruePeakDb === -1.0)
ok("the ask leaves room for the encoder", VOICE_NORMALIZE.truePeakDb < VOICE_NORMALIZE.maxEncodedTruePeakDb)
{
  const IM = read("scripts/social/importVoiceClips.ts")
  ok("the importer warns against the STORED guarantee, not the ask",
    /inputTp > VOICE_NORMALIZE\.maxEncodedTruePeakDb/.test(IM))
}
ok("two-pass: measure then apply", /print_format=json/.test(measureFilter(false)) && /measured_I=/.test(applyFilter({ inputI: -20, inputTp: -5, inputLra: 3, inputThresh: -30 }, false)))
ok("linear=true keeps one gain factor over the clip", /linear=true/.test(applyFilter({ inputI: -20, inputTp: -5, inputLra: 3, inputThresh: -30 }, false)))
ok("pass one measures the chain it will APPLY, compressor included",
  measureFilter(true).startsWith(VOICE_NORMALIZE.compressor) && applyFilter({ inputI: -20, inputTp: -5, inputLra: 3, inputThresh: -30 }, true).startsWith(VOICE_NORMALIZE.compressor))

console.log("\ncompression only where gain alone cannot reach the target:")
ok("a wide-crest clip is compressed", needsCompression({ inputI: -24.76, inputTp: -3.68 }))
ok("a tight-crest clip is NOT", !needsCompression({ inputI: -16.73, inputTp: -1.97 }))
ok("crest factor is peak minus loudness", Math.abs(crestFactorDb({ inputI: -24, inputTp: -4 }) - 20) < 0.001)
ok("the threshold is a named constant, not a literal", VOICE_NORMALIZE.compressAboveCrestDb === 16)

console.log("\nmeasurements are parsed from the LAST json loudnorm prints:")
{
  const noise = '"input_i" : "-99.00",\n' + 'blah\n' + '"input_i" : "-21.00",\n"input_tp" : "-4.00",\n"input_lra" : "3.00",\n"input_thresh" : "-31.00",'
  const m = parseLoudnorm(noise)
  ok("the last occurrence wins", m?.inputI === -21)
  ok("a missing field yields null, not a guess", parseLoudnorm('"input_i" : "-21.00",') === null)
  ok("-inf is not a number", parseLoudnorm('"input_i" : "-inf",\n"input_tp" : "-4.00",\n"input_lra" : "3.00",\n"input_thresh" : "-31.00",') === null)
}

// ── 7. THE MASTER STAGE ───────────────────────────────────────────────────────────────────────
console.log("\nthe final mix (B2), and the ceiling that was measured, not assumed:")
ok("master target is -14 LUFS", MASTER_LOUDNESS.targetLufs === -14)
// -1 was tried and the finished AAC measured -0.55 dBTP. -1.5 costs 0.04 dB and lands at -1.41.
ok("master ceiling is -1.5 dBTP, not -1", MASTER_LOUDNESS.truePeakDb === -1.5)
ok("it can be switched off entirely", typeof MASTER_LOUDNESS.enabled === "boolean")
ok("two-pass here too", /print_format=json/.test(masterMeasureFilter()) && /measured_I=/.test(masterApplyFilter({ inputI: -16, inputTp: -1.1, inputLra: 3, inputThresh: -27 })))
ok("linear=true on the master as well", /linear=true/.test(masterApplyFilter({ inputI: -16, inputTp: -1.1, inputLra: 3, inputThresh: -27 })))

console.log("\nit runs ONCE, on the finished file, and never re-normalises the voice:")
{
  const RV = read("lib/social/renderVideo.ts")
  ok("the master pass is applied after the render completes", /await applyMasterLoudness\(ffmpegPath, input\.outputPath, input\.workDir\)/.test(RV))
  ok("…and the video stream is COPIED, not re-encoded", /applyMasterLoudness[\s\S]{0,1400}"-c:v", "copy"/.test(RV))
  ok("the voice clips themselves are untouched by it", !/applyMasterLoudness[\s\S]{0,1400}(hookPath|ctaPath)/.test(RV))
  ok("a failure leaves the render standing", /catch \{\s*return false/.test(RV))
  ok("disabled means skipped, not neutered", /if \(!MASTER_LOUDNESS\.enabled\) return false/.test(RV))
  ok("silence is not 'normalised'", /if \(!m\) return false/.test(RV))
  ok("ducking and mixing are unchanged", VOICE_MIX.duckLevel === 0.2 && VOICE_MIX.rampSeconds === 0.25)
}

// ── 8. THE IMPORTER ───────────────────────────────────────────────────────────────────────────
console.log("\nthe importer preserves originals and can be re-run:")
{
  const IM = read("scripts/social/importVoiceClips.ts")
  ok("the original is uploaded unmodified", /upload\(origKey, await fs\.readFile\(f\.path\)/.test(IM))
  ok("the derivative is a SEPARATE object", /normalized\/\$\{path\.basename\(r\.normalizedPath\)\}/.test(IM))
  ok("…and never overwrites storage_path", /storage_path: origKey, normalized_storage_path: normKey/.test(IM))
  ok("re-running upserts rather than duplicating", /onConflict: "user_id,original_filename"/.test(IM))
  ok("ffmpeg cannot eat the loop's stdin", /"-nostdin"/.test(IM))
  ok("a dry run writes nothing", /const DRY = process\.argv\.includes\("--dry-run"\)/.test(IM) && /DRY \? null : createClient/.test(IM))
  ok("flagged clips are stored as review, not as normalized", /r\.meta\.review\.length \? "review"/.test(IM))
  const SQL = readFileSync(join(process.cwd(), "supabase/migrations/20261109000000_voice_clip_library.sql"), "utf8")
  ok("the migration is additive only", /add column if not exists/.test(SQL) && !/drop column|drop table|truncate|delete from/i.test(SQL))
  ok("…and enforces the natural key itself", /create unique index if not exists social_voice_clips_user_original_filename_key/.test(SQL))
  ok("the vocabularies are constrained in the database", /market in \('SATX','DAL','HOU','GENERAL'\)/.test(SQL))
  ok("…including the six CTA keywords", /cta_keyword in \('LIST','TOWN','LOFT','RISE','HOME','KEY'\)/.test(SQL))
}

console.log("\nno trimming is performed anywhere:")
{
  const VN = read("lib/social/voiceNormalize.ts")
  const IM = read("scripts/social/importVoiceClips.ts")
  ok("the normaliser contains no silenceremove", !/silenceremove/.test(VN))
  ok("…and no atrim", !/atrim/.test(VN))
  ok("the importer trims nothing either", !/silenceremove|atrim=start/.test(IM))
  ok("but speech boundaries ARE measured and stored", /speech_start_seconds: r\.speech\.start/.test(IM))
}

console.log("\nthe vocabularies line up end to end:")
ok("4 markets", VOICE_MARKETS.length === 4)
ok("6 categories", VOICE_CATEGORIES.length === 6)
ok("6 CTA keywords", Object.keys(CTA_PROPERTY_TYPES).length === 6)

console.log("\ntranscripts drive the tier, not filenames:")
{
  ok("a plain sentence is universal", classifyFromTranscript("Looking for a townhome? This one is for you.").tier === "universal")
  ok("a client claim is conditional", classifyFromTranscript("One client got eight weeks free.").tier === "conditional")
  ok("a client claim AND a pointer at the screen is property-specific",
    classifyFromTranscript("I just helped my client get an amazing deal on this apartment.").tier === "property_specific")
  ok("a special is flagged", classifyFromTranscript("One client got eight weeks free.").requires.includes("verified_special"))
  ok("a price is flagged", classifyFromTranscript("Here is what $1,500 gets you.").requires.includes("verified_price"))
  ok("three tiers, no more", ELIGIBILITY_TIERS.length === 3)
}

// ── 9. THE EDITOR WORKFLOW ────────────────────────────────────────────────────────────────────
console.log("\nrecommendations are ADVISORY — nothing applies them:")
{
  const C = read("components/crm/social/VoiceClipsControl.tsx")
  const API = read("app/api/admin/social-autopilot/posts/[id]/voice-suggestions/route.ts")
  ok("the suggestions route only reads", !/\.(insert|update|upsert|delete)\(/.test(API))
  ok("…and is platform-admin gated", /requirePlatformAdmin\(\)/.test(API))
  ok("the control never calls onChange on its own", !/useEffect\([^)]*\{[^}]*onChange\(/.test(C))
  ok("a recommendation is applied by a CLICK, through the same onChange as any manual pick",
    /onClick=\{\(\) => r\.id && onChange\(\{ hookId: type === "hook" \? r\.id : hookId/.test(C))
  ok("absent postId ⇒ no fetch at all, old behaviour intact", /if \(!postId\) return/.test(C))
}

console.log("\nhooks and CTAs are recommended separately, with reasons:")
{
  const C = read("components/crm/social/VoiceClipsControl.tsx")
  ok("each section picks its own list", /type === "hook" \? sug\?\.recommended\.hooks : sug\?\.recommended\.ctas/.test(C))
  ok("the reason is rendered per clip", /\(r\.why \?\? \[\]\)\.map/.test(C))
  ok("a Recommended heading exists", />Recommended</.test(C))
  ok("…and a separate Needs-confirmation group", />Needs confirmation</.test(C))
  ok("None is still offered in every section", /None\s*<\/button>/.test(C))
  ok("preview survives in the recommended rows", /aria-label="Preview"[\s\S]{0,200}preview\(c\.previewUrl\)/.test(C))
}

console.log("\nwarnings: factual conflicts block, claims to confirm do not:")
{
  const API = read("app/api/admin/social-autopilot/posts/[id]/voice-suggestions/route.ts")
  const C = read("components/crm/social/VoiceClipsControl.tsx")
  const E = read("components/crm/social/PostEditor.tsx")
  ok("a hard conflict is an isClipCompatible failure", /if \(!hard\.ok\) return \{ level: "hard"/.test(API))
  ok("a conditional claim is soft", /if \(!auto\.ok\) return \{ level: "soft"/.test(API))
  ok("an untranscribed clip that could make a claim is soft, not hard",
    /transcriptStatus !== "confirmed" && \(c\.pricePoint !== null \|\| c\.requires\.length > 0\)[\s\S]{0,160}"soft"/.test(API))
  ok("only hard conflicts block publishing", /blocksPublish: hookWarning\?\.level === "hard" \|\| ctaWarning\?\.level === "hard"/.test(API))
  ok("the control renders both levels differently", /warning\.level === "hard"[\s\S]{0,120}border-red-500/.test(C))
  ok("the editor disables Mark ready on a hard conflict", /disabled=\{busy \|\| voiceBlocksPublish\}/.test(E))
  ok("…and says why", /conflicts with this video/.test(E))
  ok("…covering both reasons it can block: a wrong fact and two clips that cannot fit",
    /factual detail, or the two clips not fitting without overlapping/.test(E))
}

// ── THE PRICE COMES FROM THE VIDEO, NOT THE CATALOG ───────────────────────────────────────────
// property_catalog holds a starting rent for 1 of the 155 properties Social Beast posts about, so
// checking spoken prices against it refused almost every price hook. The number that matters is
// the one the overlay prints — and it has to be read by the SAME parser, or the caption and the
// voiceover can disagree about what the video costs.
console.log("\nthe spoken price is checked against the price the video displays:")
{
  const R = read("app/api/admin/social-autopilot/posts/[id]/voice-suggestions/route.ts")
  ok("the route selects the displayed price from social_content", /budget_range/.test(R) && /price_label_mode/.test(R))
  ok("…and parses it with composePost's own lowestPrice", /lowestPrice\(src\?\.budget_range/.test(R))
  ok("…and reads the label mode with composePost's own priceLabelMode", /priceLabelMode\(src\?\.price_label_mode/.test(R))
  ok("property_catalog is no longer consulted for a rent", !/property_catalog/.test(R) || !/starting_rent/.test(R))
  ok("…so the service-role client is no longer needed here", !/supabaseAdmin/.test(R))
  ok("nothing in the route writes", !/\.(insert|update|upsert|delete)\(/.test(R))

  const V = read("components/crm/social/VoiceClipsControl.tsx")
  ok("the control warns when the two clips cannot fit", /Hook and CTA don.*t fit/.test(V) && /publishing is blocked/i.test(V))
  ok("…using the duration the preview player already loaded", /videoDurationSeconds/.test(V))
  ok("…and that warning blocks publishing too", /blocksPublish \?\? false\) \|\| fit !== null/.test(V))
  ok("…and it never trims or speeds anything up to make a pair fit", !/atrim|atempo|setpts|playbackRate/.test(V))

  const P = read("components/crm/social/PostEditor.tsx")
  ok("the editor reads the source duration from the preview's metadata", /setSourceSeconds\(v\.duration\)/.test(P))
  ok("…and hands it to the voice control", /videoDurationSeconds=\{sourceSeconds\}/.test(P))

  const RV = read("lib/social/renderVideo.ts")
  ok("the renderer refuses an overlapping pair outright", /voiceClipsFit\(source\.durationSeconds/.test(RV))
  ok("…from the duration it probed itself", /do not fit in this/.test(RV))
  // `<=` with no epsilon IS the no-gap rule: a pair that exactly fills the video is a fit.
  const FIT = read("lib/social/voiceFit.ts")
  // `<=` with no epsilon IS the no-gap rule: a pair that exactly fills the video is a fit.
  ok("…with no minimum gap between them", /hookDurationSeconds \+ ctaDurationSeconds <= videoDurationSeconds/.test(FIT))
  ok("…and the shared rule module stays dependency-free, so the client can use it", !/^import /m.test(FIT))
}

// ── THE DURATION INDICATOR IS EDITOR CHROME, NOT VIDEO ────────────────────────────────────────
// A timestamp drawn over the preview must never reach a rendered file. The only thing that writes
// pixels into an MP4 is renderVideo's draw plan, and this badge is a DOM element in the editor —
// these assertions keep it that way, and keep its arithmetic on measured seconds.
console.log("\nthe video-duration indicator is editor-only:")
{
  const P = read("components/crm/social/PostEditor.tsx")
  ok("the preview carries a timestamp", /\{sourceSeconds\.toFixed\(1\)\}s/.test(P))
  ok("…bottom-right, over the player", /absolute bottom-2 right-2/.test(P))
  ok("…not taking clicks from the native controls", /pointer-events-none absolute bottom-2 right-2/.test(P))
  ok("…read from the player's own metadata", /setSourceSeconds\(v\.duration\)/.test(P))
  ok("…and forgotten when the footage changes", /setSourceSeconds\(null\)/.test(P))

  // ONE LINE, ONLY WHEN THERE IS AUDIO. Hook-only, CTA-only, both — never an empty "·".
  ok("the timing line appears only when a clip is selected",
    /voiceSeconds\.hookSeconds !== null \|\| voiceSeconds\.ctaSeconds !== null/.test(P))
  ok("…and omits the part that is not selected", /\.filter\(Boolean\)\.join\(" · "\)/.test(P))
  ok("…reusing the lengths the voice control already knows", /onSelectionDurationsChange=\{setVoiceSeconds\}/.test(P))

  // Nothing about this reaches the renderer.
  const RV = read("lib/social/renderVideo.ts")
  // The renderer DOES format seconds — in the refusal message when two clips will not fit. What
  // it must never do is draw them, so this looks at the drawing surface, not at every number.
  ok("the renderer draws no timestamp", !/sourceSeconds/.test(RV) && !/drawtext[^\n]*duration/i.test(RV))
  const OS = read("lib/social/overlaySpec.ts")
  ok("…and neither does the overlay spec", !/duration.*badge|timestamp/i.test(OS))

  // MEASURED SECONDS, NOT ROUNDED ONES. duration_seconds is whole seconds; 5 + 6 does not fit in
  // a 10.3s video while the real 4.07 + 5.27 does, and the overlap check does that sum.
  // Deleting a clip destroys the uploaded original too, and the × sits beside every row.
  ok("deleting a clip asks first", /window\.confirm\(/.test(read("components/crm/social/VoiceClipsControl.tsx")))
  ok("…and names the clip being deleted", /Delete .{0,4}\$\{name\}/.test(read("components/crm/social/VoiceClipsControl.tsx")))

  const VC = read("app/api/admin/social-autopilot/voice-clips/route.ts")
  ok("the clips API prefers the measured duration", /duration_original/.test(VC))
  ok("…falling back to the rounded one", /Number\.isFinite\(measured\) && measured > 0 \? measured : r\.duration_seconds/.test(VC))
}

console.log("\nmanual selections survive, and the renderer never second-guesses them:")
{
  const RP = read("lib/social/renderPost.ts")
  const API_POST = read("app/api/admin/social-autopilot/posts/[id]/route.ts")
  ok("the render reads the SAVED ids", /voiceLocal\(\(p\.voice_hook_id as string \| null\)/.test(RP))
  ok("…and nothing re-selects at render time", !/selectVoiceClips|isAutoEligible|isClipCompatible/.test(RP))
  ok("the draft PATCH persists exactly what was chosen", /patch\.voice_hook_id = body\.voiceHookId/.test(API_POST))
  ok("…including an explicit null", /body\.voiceHookId === null/.test(API_POST))
  ok("swapping a clip invalidates the render", /"voice_hook_id"/.test(read("lib/social/renderInvalidation.ts")))
}

console.log("\nthe featured property type is per-VIDEO, never written to the catalog:")
{
  const API = read("app/api/admin/social-autopilot/posts/[id]/voice-suggestions/route.ts")
  const SQL = readFileSync(join(process.cwd(), "supabase/migrations/20261109000000_voice_clip_library.sql"), "utf8")
  ok("the post's own choice wins over the content record", /post\.featured_property_type as string \| null\) \?\? normalizePropertyType/.test(API))
  ok("the column lives on social_posts", /alter table public\.social_posts[\s\S]{0,120}featured_property_type/.test(SQL))
  ok("…constrained to the six CTA types", /'Apartment','Townhome','Loft','High-Rise','Rental Home','Penthouse'/.test(SQL))
  ok("property_catalog is never written", !/update public\.property_catalog|property_catalog[\s\S]{0,40}\.update\(/.test(API + SQL))
  // social_content.property_type is populated on every row with exactly this vocabulary, which is
  // why property_catalog.property_type being NULL on all 4,204 rows never mattered.
  ok("variants collapse to their base type", normalizePropertyType("Split-Level Loft") === "Loft"
    && normalizePropertyType("Industrial-Style Loft") === "Loft"
    && normalizePropertyType("Split-Level Penthouse") === "Penthouse")
  ok("an unrecognised value is unknown, not a guess", normalizePropertyType("townhome_loft") === null)
  ok("…and so is empty", normalizePropertyType(null) === null)
}

console.log("\nsafe fallback — an unknown type does not unlock a type-specific claim:")
{
  // The bug: the type check only fired when BOTH sides named a type, so "unknown" silently
  // satisfied it and a high-rise hook was recommended for a property of unrecorded type.
  const rise = clip("01_Hooks", "High_Rise_Fortune_Check_OUT.m4a")
  const unknown = prop("DAL", 1500, null)
  ok("a high-rise hook is NOT auto-recommended for an unknown type", !isAutoEligible(rise, unknown).ok)
  ok("…and says what would fix it", isAutoEligible(rise, unknown).reasons.some((r) => /set the featured type/.test(r)))
  ok("it IS recommended once the type is set", isAutoEligible(rise, prop("DAL", 1500, "High-Rise")).ok)
  ok("…and refused for a different type", !isAutoEligible(rise, prop("DAL", 1500, "Rental Home")).ok)
}

console.log(`\nVoice library: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
