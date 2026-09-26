/**
 * Property Image Intelligence v1.0 — scene classification regression tests.
 * Freezes the v1.0 fixes for the obvious canary-observed classification errors.
 *   npx tsx scripts/tests/image-scene.test.ts
 */
import { classifyScene, inferPropertyType, familyRank } from "@/scripts/propertyIntel/imageEngine"

let pass = 0, fail = 0
function ok(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓ " + msg) } else { fail++; console.log("  ✗ " + msg) } }

// ── gym/fitness must NEVER classify as Pool (or exterior/kitchen) ──
ok(classifyScene("state-of-the-art fitness center with cardio machines").fam === "amenity_weak", "fitness center → amenity_weak")
ok(classifyScene("resident gym").fam === "amenity_weak", "gym → amenity_weak")
ok(classifyScene("fitness center near the resort pool").fam === "amenity_weak", "gym text mentioning pool → still amenity_weak (not Pool)")
ok(classifyScene("weight room / workout area").fam === "amenity_weak", "weight room → amenity_weak")

// ── "pool table" / game room is NOT a Pool ──
ok(classifyScene("resident game room with pool table and billiards").fam !== "pool", "pool table → NOT Pool")
ok(classifyScene("sparkling resort pool with lounge chairs").fam === "pool", "real pool → Pool")
ok(classifyScene("rooftop infinity pool overlooking downtown").fam === "pool", "infinity pool → Pool")

// ── living room must NOT be Kitchen unless kitchen is the sole/dominant subject ──
ok(classifyScene("charming living room with a cozy fireplace and modern decor").fam === "living", "living room → Living (not Kitchen)")
ok(classifyScene("open-concept living room and kitchen with wood floors").fam === "living", "open-concept living+kitchen → Living")
ok(classifyScene("furnished primary bedroom with large windows").fam === "living", "bedroom → Living/Interior")
ok(classifyScene("modern kitchen with stainless steel appliances and granite").fam === "kitchen", "pure kitchen → Kitchen")
ok(classifyScene("gourmet kitchen island").fam === "kitchen", "kitchen island → Kitchen")

// ── exterior / aerial ──
ok(classifyScene("two story home exterior with fenced front yard").fam === "exterior", "home exterior → Exterior")
ok(classifyScene("aerial view of the community overlooking the grounds").fam === "exterior", "aerial → Exterior")

// ── generic gym ranks BELOW strong scenes for Primary (all property types) ──
for (const type of ["High-Rise/Mid-Rise", "Garden/Conventional", "BTR/Rental Homes"] as const) {
  const gym = familyRank(type, "amenity_weak")
  ok(gym > familyRank(type, "exterior") && gym > familyRank(type, "pool") && gym > familyRank(type, "kitchen") && gym > familyRank(type, "living"),
    `${type}: gym ranks below exterior/pool/kitchen/interior`)
}

// ── property-type preferences preserved ──
ok(familyRank("Garden/Conventional", "pool") < familyRank("Garden/Conventional", "living"), "Garden: pool preferred")
ok(familyRank("High-Rise/Mid-Rise", "exterior") === 0, "High-Rise: exterior first")
ok(inferPropertyType("Zetta", "two story home exterior fenced yard") === "BTR/Rental Homes", "BTR inferred from home evidence")
ok(inferPropertyType("The Tower on Main", "high-rise downtown") === "High-Rise/Mid-Rise", "High-Rise inferred")

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
