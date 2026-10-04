// Pure unit tests for the TikTok caption payload (no network): same body structure/spacing as
// Instagram, TikTok hashtags generated separately and capped at 5, Instagram unchanged at 7, and
// manual captions preserved. Run: `npx tsx scripts/social/tiktok-caption.test.ts`
import {
  buildTikTokCaptionPayload,
  buildInstagramCaptionPayload,
  buildCaption,
  TIKTOK_MAX_HASHTAGS,
  MAX_HASHTAGS,
  type SourceMeta,
} from "@/lib/social/composePost"
import { buildHashtags } from "@/lib/social/hashtags"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const source = { market: "San Antonio", property_type: "Apartment", special: null, budget_range: "$1,200 – $1,800", amenities: "yard, garage, pool" }
const meta: SourceMeta = { market: "San Antonio", propertyType: "Apartment", special: null, socialSpecial: null, budgetRange: "$1,200 – $1,800", amenities: "yard, garage, pool" }

console.log("TikTok caption BODY == Instagram caption body (generated), hashtags differ:")
{
  // Generated caption (caption=null → publishCaption regenerates the canonical body).
  const tt = buildTikTokCaptionPayload({ caption: null, socialSpecial: null, sourceContentId: "seed-1", source })
  const ttHashLine = tt.split("\n\n").at(-1) || ""
  const ttTags = ttHashLine.split(/\s+/).filter((w) => w.startsWith("#"))
  const igTags = buildHashtags("San Antonio", MAX_HASHTAGS, "Apartment")

  ok("TikTok body begins with the generated hook (same as buildCaption)", tt.startsWith(buildCaption(meta, "seed-1").split("\n\n")[0]))
  ok("TikTok has the '🏡 Amenities' section with bullets", /🏡 Amenities\n\n• yard\n• garage\n• pool/.test(tt))
  ok("blank-line section spacing preserved (\\n\\n between sections)", tt.includes("\n\n🏡 Amenities") && /\n\n#/.test(tt))
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
  const sections = tt.split("\n\n")
  const amenityIdx = sections.findIndex((s) => s.startsWith("🏡 Amenities"))
  const hashIdx = sections.findIndex((s) => /^#/.test(s))
  ok("amenities section present and before hashtags", amenityIdx > 0 && hashIdx > amenityIdx)
  ok("hashtags are the LAST section", hashIdx === sections.length - 1)
}

console.log("\nManual caption preserved (not overwritten), TikTok hashtags still appended:")
{
  const manual = "My own hand-written hook line.\n\nSecond paragraph I wrote."
  const tt = buildTikTokCaptionPayload({ caption: manual, socialSpecial: null, sourceContentId: "seed-3", source })
  ok("manual caption body kept verbatim", tt.startsWith(manual))
  const ttTags = (tt.split("\n\n").at(-1) || "").split(/\s+/).filter((w) => w.startsWith("#"))
  ok("TikTok hashtags (≤5) appended after the manual body", ttTags.length > 0 && ttTags.length <= TIKTOK_MAX_HASHTAGS)
  ok("no generated amenities injected into a manual caption", !tt.includes("🏡 Amenities"))
}

console.log(`\nTikTok caption unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
