// Unit tests for filename inference + property-type detection (shared single/bulk path).
import { inferFromFilename } from "@/lib/social/filenameInference"
import { detectPropertyType, propertyNoun, PROPERTY_TYPES } from "@/lib/social/propertyTypes"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

console.log("representative filenames:")
const a = inferFromFilename("collection-at-schertz-townhomes-san-antonio.MP4")
ok("property = 'Collection at Schertz Townhomes'", a.propertyName === "Collection at Schertz Townhomes")
ok("market = San Antonio (stripped from name)", a.market === "San Antonio")
ok("type = Townhome", a.propertyType === "Townhome")
ok("confidence ready", a.confidence === "ready")

const b = inferFromFilename("IMG_3847.mp4")
ok("IMG_3847 → no property name", b.propertyName === null)
ok("IMG_3847 → no market", b.market === null)
ok("IMG_3847 → missing", b.confidence === "missing")

const c = inferFromFilename("the_maple_high-rise_dallas.mov")
ok("Dallas stays Dallas (NOT DFW)", c.market === "Dallas")
ok("high-rise detected", c.propertyType === "High-Rise")
ok("name title-cased (hyphens normalized to spaces)", c.propertyName === "The Maple High Rise")
ok("ready", c.confidence === "ready")

const d = inferFromFilename("alta-fort-worth-apartments.mp4")
ok("Fort Worth → DFW", d.market === "DFW")
ok("apartments → Apartment", d.propertyType === "Apartment")
ok("name keeps 'Apartments'", d.propertyName === "Alta Apartments")

const e = inferFromFilename("dji_0091.MP4")
ok("dji_0091 generic → missing", e.confidence === "missing" && e.propertyName === null)

const f = inferFromFilename("mueller-flats-austin.mp4")
ok("Austin market", f.market === "Austin")
ok("no type keyword → null type", f.propertyType === null)
ok("name = Mueller Flats", f.propertyName === "Mueller Flats")
ok("review (name+market present → actually ready)", f.confidence === "ready")

const g = inferFromFilename("student-living-tower-houston.mp4")
ok("Houston + Student Housing", g.market === "Houston" && g.propertyType === "Student Housing")

const h = inferFromFilename("garden-style-villas.mp4") // no market
ok("garden-style type", h.propertyType === "Garden-Style")
ok("no market → review", h.market === null && h.confidence === "review")

console.log("property type detection + noun:")
ok("btr variant", detectPropertyType("the reserve btr collection") === "Build-to-Rent")
ok("townhouse variant", detectPropertyType("maple townhouse") === "Townhome")
ok("noun townhome", propertyNoun("Townhome") === "townhome")
ok("noun default apartment", propertyNoun(null) === "apartment")
ok("8 property types", PROPERTY_TYPES.length === 8)

console.log(`\nInference unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
