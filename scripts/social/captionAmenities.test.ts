/**
 * CAPTION SPACING + AMENITY BANK ADDITIONS.
 *
 * Two small changes with one shared hazard: the caption format is PARSED, not
 * just printed. isGeneratedCaption() decides whether a stored caption is
 * generator-owned (regenerate at publish) or a manual override (publish
 * verbatim). If a spacing change made old captions stop matching, every existing
 * draft would be frozen as "manual" — the exact bug whose fix is documented in
 * captionKey, and which once let a stale caption publish.
 *
 * So the real test is not "is there a blank line" but "does the blank line
 * change any classification". It must not.
 *
 * Run: npx tsx scripts/social/captionAmenities.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { buildCaption, isGeneratedCaption, publishCaption, type SourceMeta } from "@/lib/social/composePost"
import { AMENITY_BANK, canonicalizeAmenity, isCanonicalAmenity, parseAmenities } from "@/lib/social/amenities"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const META: SourceMeta = {
  market: "Dallas", propertyType: "High-Rise", special: null, socialSpecial: "One month free",
  budgetRange: "$1,800", amenities: "Skyline Views\nQuartz Countertops\nResort-Style Pool",
}

async function main() {
  console.log("\nCAPTION SPACING + AMENITY BANK\n")

  console.log("THE BLANK LINE IS THERE:")
  {
    const cap = buildCaption(META, "seed-1")
    const lines = cap.split("\n")
    const i = lines.findIndex((l) => /^🏡\s*Amenities\s*$/.test(l.trim()))
    ok("the caption has an Amenities heading", i >= 0, cap)
    ok("the line immediately after the heading is BLANK", i >= 0 && lines[i + 1] === "")
    ok("…and the bullets start on the line after that",
      i >= 0 && /^•\s/.test(lines[i + 2] ?? ""))
    ok("all three bullets are present and consecutive",
      i >= 0 && [2, 3, 4].every((k) => /^•\s/.test(lines[i + k] ?? "")),
      JSON.stringify(lines.slice(i, i + 6)))
    ok("there is exactly ONE blank line, not two",
      i >= 0 && lines[i + 1] === "" && lines[i + 2] !== "")
  }

  console.log("\nCLASSIFICATION IS UNCHANGED (the thing that could break):")
  {
    const fresh = buildCaption(META, "seed-1")
    ok("a freshly generated caption is generator-owned", isGeneratedCaption(fresh, META, "seed-1"))

    // The SAME caption as stored by the previous engine — identical except the
    // blank line this change adds.
    const old = fresh.replace(/(🏡 Amenities)\n\n/, "$1\n")
    ok("the old spacing really is different", old !== fresh)
    ok("an OLD caption is STILL generator-owned (not frozen as manual)",
      isGeneratedCaption(old, META, "seed-1"))
    ok("…and publishes regenerated in the new format",
      publishCaption(old, META, "seed-1").includes("🏡 Amenities\n\n•"))

    // And a genuine manual caption is still left alone.
    const manual = "I wrote this myself and it should publish verbatim."
    ok("a manual caption is still NOT generator-owned", !isGeneratedCaption(manual, META, "seed-1"))
    ok("…and publishes verbatim", publishCaption(manual, META, "seed-1") === manual)
  }

  console.log("\nMAX-3 AMENITIES IS UNCHANGED:")
  {
    const many: SourceMeta = { ...META, amenities: "Skyline Views\nQuartz Countertops\nResort-Style Pool\nDog Park\nConcierge\nHigh Ceilings" }
    const cap = buildCaption(many, "seed-2")
    const bullets = cap.split("\n").filter((l) => /^•\s/.test(l))
    ok("exactly 3 bullets even with 6 amenities", bullets.length === 3, JSON.stringify(bullets))
    ok("…and they are the FIRST three, in order",
      bullets[0]!.includes("Skyline Views") && bullets[1]!.includes("Quartz Countertops") && bullets[2]!.includes("Resort-Style Pool"))
    ok("the slice(0, 3) is still the only cap",
      /features\(src\.amenities\)\.slice\(0, 3\)/.test(read("lib/social/composePost.ts")))
  }

  console.log("\nNO AMENITIES → NO HEADING, NO STRAY BLANK LINE:")
  {
    const none: SourceMeta = { ...META, amenities: null }
    const cap = buildCaption(none, "seed-3")
    ok("no Amenities heading when there are none", !/🏡\s*Amenities/.test(cap))
    ok("…and no run of three newlines anywhere", !/\n\n\n/.test(cap), JSON.stringify(cap))
  }

  console.log("\nTHE 22 REQUESTED VALUES ARE ALL SELECTABLE NOW:")
  {
    const requested = [
      "Concrete Flooring", "High Ceilings", "Exposed Concrete Ceilings", "Floor-to-Ceiling Windows",
      "Skyline Views", "City Views", "Downtown Views", "Private Balcony", "Quartz Countertops",
      "Resort-Style Pool", "Coworking Space", "Clubroom", "Sky Lounge", "Concierge",
      "Controlled Access", "Garage Parking", "EV Charging", "Dog Park", "Pet Spa", "Package Lockers",
    ]
    const missing = requested.filter((r) => !isCanonicalAmenity(r))
    ok(`all ${requested.length} are in the bank`, missing.length === 0, `missing: ${JSON.stringify(missing)}`)

    const added = ["Concrete Flooring", "High Ceilings", "Exposed Concrete Ceilings", "Private Balcony", "Clubroom", "Sky Lounge", "Garage Parking"]
    for (const a of added) ok(`"${a}" was added`, AMENITY_BANK.includes(a))
  }

  console.log("\nNO DUPLICATES WERE INTRODUCED:")
  {
    const nk = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "")
    const keys = AMENITY_BANK.map(nk)
    ok("every bank entry has a unique canonical key", new Set(keys).size === keys.length,
      `dupes: ${JSON.stringify(keys.filter((k, i) => keys.indexOf(k) !== i))}`)

    // The two singular forms were deliberately NOT added: normalizeKey keeps the
    // trailing "s", so they would have become second chips meaning the same thing.
    ok('"Walk-In Closet" (singular) was NOT added as a second entry',
      !AMENITY_BANK.includes("Walk-In Closet") && AMENITY_BANK.includes("Walk-In Closets"))
    ok('"Kitchen Island" (singular) was NOT added as a second entry',
      !AMENITY_BANK.includes("Kitchen Island") && AMENITY_BANK.includes("Kitchen Islands"))
    // And the reason is real, not assumed: prove they do NOT collapse.
    ok("…because the singular does NOT canonicalize to the plural",
      canonicalizeAmenity("Walk-In Closet") === "Walk-In Closet" &&
      canonicalizeAmenity("Kitchen Island") === "Kitchen Island")

    ok("no entry is empty or untrimmed", AMENITY_BANK.every((a) => a === a.trim() && a.length > 0))
  }

  console.log("\nEXISTING BEHAVIOUR AROUND THE BANK IS UNTOUCHED:")
  {
    ok("variant matching still canonicalizes",
      canonicalizeAmenity("floor to ceiling windows") === "Floor-to-Ceiling Windows")
    ok("a NEW entry canonicalizes from a variant too",
      canonicalizeAmenity("exposed  concrete ceilings") === "Exposed Concrete Ceilings")
    ok("custom values are still preserved verbatim",
      canonicalizeAmenity("Rooftop Dog Run With A View") === "Rooftop Dog Run With A View")
    ok("stored parsing still de-dupes and keeps order",
      JSON.stringify(parseAmenities("High Ceilings\nhigh ceilings\nClubroom")) === JSON.stringify(["High Ceilings", "Clubroom"]))
    ok("legacy comma storage still parses",
      JSON.stringify(parseAmenities("Clubroom, Sky Lounge")) === JSON.stringify(["Clubroom", "Sky Lounge"]))
  }

  console.log("\nNOTHING ELSE IN POST GENERATION MOVED:")
  {
    const compose = read("lib/social/composePost.ts")
    ok("the CTA lines still close the caption",
      /sections\.push\(CTA_LINES\[0\], CTA_LINES\[1\]\)/.test(compose))
    ok("sections are still joined by a blank line and capped at 1800",
      /sections\.join\("\\n\\n"\)\.slice\(0, 1800\)/.test(compose))
    ok("the hashtag cap is untouched", /MAX_HASHTAGS/.test(compose))
    ok("captionKey still drops empty lines (what makes this safe)",
      /\.map\(\(l\) => l\.trim\(\)\)\.filter\(Boolean\)/.test(compose))
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  if (fail > 0) process.exit(1)
}

void main()
