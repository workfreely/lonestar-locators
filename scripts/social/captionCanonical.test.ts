// Regression: the shared caption source of truth must (a) recognize OLDER inline-amenity captions
// as generator-owned, and (b) publish generator-owned captions in the CURRENT canonical format
// (blank-line sections + "🏡 Amenities" bullets), while preserving genuine MANUAL captions.
// Run: npx tsx scripts/social/captionCanonical.test.ts
import { buildCaption, isGeneratedCaption, publishCaption, type SourceMeta } from "@/lib/social/composePost"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

// The real Collection Schertz Station source + seed (source_content_id).
const SA: SourceMeta = { market: "San Antonio", propertyType: null, special: null, socialSpecial: null, budgetRange: null, amenities: "yard, garage, pool" }
const SEED = "d4c090e0-a9ae-4d43-800a-39310701c767"
// The exact OLD inline-amenity caption that was stored + published (single newlines, "🏡 a, b, c").
const OLD_STORED =
  "Moving to San Antonio? You need to see this one.\n🏡 yard, garage, pool\nMy apartment locating service is completely free!\nSubmit the form to get your free custom apartment list."

const canonical = buildCaption(SA, SEED)

console.log("current buildCaption is canonical (bullets + blank lines):")
ok("has 🏡 Amenities heading", canonical.includes("🏡 Amenities"))
ok("has • bullet per amenity", canonical.includes("\n• yard") && canonical.includes("\n• garage") && canonical.includes("\n• pool"))
ok("blank-line separated sections", canonical.includes("\n\n"))
ok("no inline 🏡 a, b, c line", !/🏡 yard, garage, pool/.test(canonical))

console.log("\nisGeneratedCaption recognizes generator-owned captions (the fix):")
ok("OLD inline-amenity caption ⇒ generated (was misclassified as manual)", isGeneratedCaption(OLD_STORED, SA, SEED) === true)
ok("CURRENT bulleted caption ⇒ generated", isGeneratedCaption(canonical, SA, SEED) === true)
ok("a genuine MANUAL caption ⇒ NOT generated", isGeneratedCaption("Come tour this stunning San Antonio home today!! DM me", SA, SEED) === false)

console.log("\npublishCaption canonicalizes generator-owned, preserves manual:")
ok("OLD stored caption ⇒ regenerated to canonical", publishCaption(OLD_STORED, SA, SEED) === canonical)
ok("regenerated payload has bullets", publishCaption(OLD_STORED, SA, SEED).includes("🏡 Amenities\n\n• yard\n• garage\n• pool"))
ok("MANUAL caption ⇒ returned verbatim (never clobbered)", publishCaption("Come tour this stunning San Antonio home today!! DM me", SA, SEED) === "Come tour this stunning San Antonio home today!! DM me")
ok("null stored ⇒ regenerated canonical", publishCaption(null, SA, SEED) === canonical)

console.log("\nGLOBAL — not hardcoded to San Antonio/yard/garage/pool (other markets + amenities):")
for (const [market, amenities, type] of [
  ["Dallas", "pool, gym", "Apartment"],
  ["Austin", "rooftop, parking, pets", "High-Rise"],
  ["Houston", "yard", "Townhome"],
] as const) {
  const src: SourceMeta = { market, propertyType: type, special: null, socialSpecial: null, budgetRange: null, amenities }
  const cap = buildCaption(src, "seed-" + market)
  const items = amenities.split(",").map((s) => s.trim())
  ok(`${market}: bulleted amenities + blank lines`, cap.includes("🏡 Amenities") && items.every((a) => cap.includes(`• ${a}`)) && cap.includes("\n\n"))
  // Simulate an OLD inline version of the same caption and confirm it re-canonicalizes.
  const oldInline = cap.replace(`🏡 Amenities\n${items.map((a) => `• ${a}`).join("\n")}`, `🏡 ${items.join(", ")}`).replace(/\n\n/g, "\n")
  ok(`${market}: old inline version ⇒ recognized + regenerated`, isGeneratedCaption(oldInline, src, "seed-" + market) && publishCaption(oldInline, src, "seed-" + market) === cap)
}

console.log("\namenity cap (max 3) preserved by the existing rule:")
{
  const many: SourceMeta = { market: "San Antonio", propertyType: null, special: null, socialSpecial: null, budgetRange: null, amenities: "pool, gym, yard, garage, balcony" }
  const cap = buildCaption(many, "cap-seed")
  const bullets = (cap.match(/^• /gm) || []).length
  ok("no more than 3 amenity bullets", bullets <= 3)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
