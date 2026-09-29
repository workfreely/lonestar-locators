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

const g = inferFromFilename("the-penthouse-collection-houston.mp4")
ok("Houston + Penthouse (canonical)", g.market === "Houston" && g.propertyType === "Penthouse")

const h = inferFromFilename("garden-style-villas.mp4") // no market, non-canonical hint
ok("non-canonical 'garden-style' → null type", h.propertyType === null)
ok("no market → review", h.market === null && h.confidence === "review")

console.log("canonical property type detection + noun:")
ok("townhouse variant → Townhome (canonical)", detectPropertyType("maple townhouse") === "Townhome")
ok("studio → Studio", detectPropertyType("downtown studio lofts") === "Studio")
ok("single-family → Rental Home", detectPropertyType("elm single-family rentals") === "Rental Home")
ok("btr no longer a type", detectPropertyType("the reserve btr collection") === null)
ok("garden-style no longer a type", detectPropertyType("garden style villas") === null)
ok("noun townhome", propertyNoun("Townhome") === "townhome")
ok("noun rental home", propertyNoun("Rental Home") === "rental home")
ok("noun default apartment", propertyNoun(null) === "apartment")
// 7 canonical (the CRM list minus the renter-preference "Open to All") + 7 Social-Beast-only content
// types: 3 Split-Level, then 4 Industrial-Style. The canonical taxonomy in lib/formOptions is NOT
// modified — these qualified values describe what a VIDEO shows and exist only in the Social source.
ok("14 SA property types (7 canonical minus 'Open to All', + 7 Social-only compound)", PROPERTY_TYPES.length === 14)
ok("canonical values come first, in their original order and spelling",
  PROPERTY_TYPES.slice(0, 7).join("|") === "Studio|Apartment|High-Rise|Townhome|Rental Home|Penthouse|Loft")
ok("compound values are Social-only and appended last, Industrial-Style after Split-Level",
  PROPERTY_TYPES.slice(7).join("|") === "Split-Level Townhome|Split-Level Penthouse|Split-Level Loft|Industrial-Style Apartment|Industrial-Style Townhome|Industrial-Style Penthouse|Industrial-Style Loft")
// Filename inference must prefer the qualified type over the plain noun it contains.
ok("split-level filenames beat the plain noun", detectPropertyType("split-level-townhome-austin.mp4") === "Split-Level Townhome" &&
  detectPropertyType("Split Level Penthouse SA.mov") === "Split-Level Penthouse" &&
  detectPropertyType("split level loft.mp4") === "Split-Level Loft")
ok("industrial-style filenames beat the plain noun", detectPropertyType("industrial-style-apartment-dfw.mp4") === "Industrial-Style Apartment" &&
  detectPropertyType("Industrial Style Townhome.mov") === "Industrial-Style Townhome" &&
  detectPropertyType("industrialstyle penthouse.mp4") === "Industrial-Style Penthouse" &&
  detectPropertyType("INDUSTRIAL-STYLE LOFTS houston.mp4") === "Industrial-Style Loft")
ok("industrial-style apts abbreviation infers the compound type", detectPropertyType("industrial style apts austin.mp4") === "Industrial-Style Apartment")
ok("plain nouns still infer the plain type", detectPropertyType("townhome-austin.mp4") === "Townhome" &&
  detectPropertyType("penthouse.mov") === "Penthouse" && detectPropertyType("loft.mp4") === "Loft")
ok("no SA-only values", !(PROPERTY_TYPES as readonly string[]).includes("Garden-Style") && !(PROPERTY_TYPES as readonly string[]).includes("Build-to-Rent"))
ok("Open to All excluded from SA", !(PROPERTY_TYPES as readonly string[]).includes("Open to All"))
ok("canonical members present", ["Studio","Apartment","High-Rise","Townhome","Rental Home","Penthouse"].every((t) => (PROPERTY_TYPES as readonly string[]).includes(t)))

console.log(`\nInference unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
