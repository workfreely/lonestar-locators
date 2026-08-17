/**
 * Current Property — Smart Apartment Data URL identity (Phase 2B). Pure, no DOM:
 *   npx tsx scripts/tests/sad-current-property.test.ts
 *
 * Verifies the URL-primary detection that decides WHICH property is open (and when
 * to clear): property-detail page → stable propertyID; results/search/other →
 * null (Current Property clears back to the placeholder). Name/address extraction
 * is DOM-based and verified visually in Chrome, not here.
 */
import { parseSadPropertyId, isSmartApartmentDataHost, stripSiteSuffix, looksLikeAddress } from "../../apps/beast-companion/src/content/sadUrl"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`)
}

// ── Property-detail page → propertyID ──
ok(parseSadPropertyId("https://app.smartapartmentdata.com/Restricted/Locator/ViewProperty.aspx?propertyID=12345") === "12345", "detail page → propertyID '12345'")
ok(parseSadPropertyId("https://smartapartmentdata.com/Restricted/Locator/ViewProperty.aspx?propertyID=9") === "9", "bare domain detail page → propertyID")
ok(parseSadPropertyId("https://app.smartapartmentdata.com/restricted/locator/viewproperty.aspx?propertyid=678") === "678", "case-insensitive path + param → '678'")
ok(parseSadPropertyId("https://app.smartapartmentdata.com/Restricted/Locator/ViewProperty.aspx?foo=bar&propertyID=42&x=y") === "42", "propertyID extracted among other params")

// ── Non-property pages → null (Current Property clears) ──
ok(parseSadPropertyId("https://app.smartapartmentdata.com/Restricted/Results.aspx") === null, "results page → null (clear)")
ok(parseSadPropertyId("https://app.smartapartmentdata.com/Restricted/Results.aspx?searchId=7") === null, "results with params → null")
ok(parseSadPropertyId("https://app.smartapartmentdata.com/Restricted/Locator/ViewProperty.aspx") === null, "detail path but NO propertyID → null (never a fabricated id)")
ok(parseSadPropertyId("https://app.smartapartmentdata.com/Restricted/Locator/ViewProperty.aspx?propertyID=") === null, "blank propertyID → null")

// ── Wrong host → null (never leaks off SAD) ──
ok(parseSadPropertyId("https://locatorbeast.com/admin/leads?propertyID=1") === null, "CRM host → null (CRM tab never sets Current Property)")
ok(parseSadPropertyId("not a url") === null, "garbage href → null (no throw)")

// ── Host matcher ──
ok(isSmartApartmentDataHost("app.smartapartmentdata.com"), "app.smartapartmentdata.com is SAD")
ok(isSmartApartmentDataHost("smartapartmentdata.com"), "bare smartapartmentdata.com is SAD")
ok(!isSmartApartmentDataHost("locatorbeast.com"), "locatorbeast.com is not SAD")

// ── Title suffix cleanup (name display helper) ──
ok(stripSiteSuffix("The Catherine - Smart Apartment Data") === "The Catherine", "strips ' - Smart Apartment Data' suffix")
ok(stripSiteSuffix("The Catherine | Smart Apartment Data") === "The Catherine", "strips ' | Smart Apartment Data' suffix")
ok(stripSiteSuffix("The Catherine") === "The Catherine", "no suffix → unchanged")
ok(stripSiteSuffix("Smart Apartment Data") === "Smart Apartment Data", "suffix-only string → left intact (never blank)")

// ── Address sanity guard (accepts real addresses, rejects headings/blurbs) ──
ok(looksLikeAddress("10718 State Highway 151 San Antonio, TX 78251"), "real address (Alta Westover Hills) accepted")
ok(looksLikeAddress("214 Barton Springs Rd, Austin, TX 78704"), "street + city + state + zip accepted")
ok(looksLikeAddress("500 Comal St, Austin"), "street + ', ST'-style city accepted")
ok(!looksLikeAddress("Alta Westover Hills"), "property name rejected (not an address)")
ok(!looksLikeAddress("Now leasing 1-2 bedrooms"), "marketing blurb rejected")
ok(!looksLikeAddress(""), "empty rejected")
ok(!looksLikeAddress("Built 2019"), "a number alone (no zip/state) rejected")

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
