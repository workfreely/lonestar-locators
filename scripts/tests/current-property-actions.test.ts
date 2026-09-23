/**
 * Current Property → Recommendations/Favorites (Phase 2C). Pure, no DB:
 *   npx tsx scripts/tests/current-property-actions.test.ts
 *
 * Verifies the write/dedup/scoping/state logic behind the Companion "+ Recommendation"
 * / "♡ Favorite" actions: dedup on (lead_id, property_url) — the the external site ViewProperty URL
 * embeds the stable propertyID; per-client scoping through the active-client payload
 * (no leakage); button state derived from the active client's REAL collections; and
 * Favorites/Recommendations independent (a property may be in both).
 */
import { buildActiveClientPayload } from "@/lib/companion/leadToDto"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`)
}

const TZ = "America/Chicago"
const lead = (id: string, name: string) => ({ id, crm_status: "searching", first_name: name })

// The detected Current Property (Alta Westover Hills).
const CP = {
  propertyId: "854711",
  propertyName: "Alta Westover Hills",
  propertyAddress: "10718 State Highway 151 San Antonio, TX 78251",
  propertyUrl: "https://app.smartapartmentdata.com/Restricted/Locator/ViewProperty.aspx?propertyID=854711",
  propertyImageUrl: null,
}

// Dedup guard — mirrors the DashboardClient add-recommendation/add-favorite handler.
function isDuplicate(list: any[], leadId: string, propertyUrl: string): boolean {
  return list.some((r) => String(r.lead_id) === String(leadId) && String(r.property_url ?? "") === propertyUrl)
}
const rowFor = (id: number, leadId: string) => ({
  id,
  lead_id: leadId,
  property_name: CP.propertyName,
  property_url: CP.propertyUrl,
  property_address: CP.propertyAddress,
  property_image_url: null,
})

// ── Dedup on (lead_id, property_url) ──
{
  let recs: any[] = []
  ok(!isDuplicate(recs, "A", CP.propertyUrl), "first add for Carlos → not a duplicate")
  recs = [...recs, rowFor(1, "A")]
  ok(isDuplicate(recs, "A", CP.propertyUrl), "second add for Carlos → duplicate (no blind re-add)")
  ok(!isDuplicate(recs, "B", CP.propertyUrl), "same property for a DIFFERENT client → not a duplicate")
}

// ── Per-client scoping via the active-client payload (no leakage) ──
{
  const recs = [rowFor(1, "A")] // added to Carlos (A)
  const pA = buildActiveClientPayload(lead("A", "Carlos"), [], null, null, TZ, [], [], recs)
  ok(pA.recommendations?.length === 1 && pA.recommendations?.[0].propertyUrl === CP.propertyUrl, "Carlos's payload includes Alta")
  const pB = buildActiveClientPayload(lead("B", "Nina"), [], null, null, TZ, [], [], recs)
  ok((pB.recommendations?.length ?? 0) === 0, "another client's payload has NO leakage")
}

// ── Button state derived from the active client's REAL collections (propertyUrl) ──
{
  const recs = [rowFor(1, "A")]
  const favs: any[] = [] // Carlos has it recommended but NOT favorited
  const p = buildActiveClientPayload(lead("A", "Carlos"), [], null, null, TZ, favs, [], recs)
  const isRecommended = (p.recommendations ?? []).some((r) => (r.propertyUrl ?? "") === CP.propertyUrl)
  const isFavorited = (p.favorites ?? []).some((f) => (f.propertyUrl ?? "") === CP.propertyUrl)
  ok(isRecommended, "state: Recommended = true (from real data)")
  ok(!isFavorited, "state: Favorited = false — independent of Recommendations")
}

// ── Recommendation and Favorite are MUTUALLY EXCLUSIVE ──
// Superseded rule: a property used to be allowed in both collections at once. They are
// now two states of one progression, so a LEGACY duplicate resolves in favour of
// Favorites and the stray recommendation is not rendered. Nothing is deleted here —
// the next deliberate move resolves the underlying row.
{
  const recs = [rowFor(1, "A")]
  const favs = [rowFor(10, "A")]
  const p = buildActiveClientPayload(lead("A", "Carlos"), [], null, null, TZ, favs, [], recs)
  const inRecs = (p.recommendations ?? []).some((r) => (r.propertyUrl ?? "") === CP.propertyUrl)
  const inFavs = (p.favorites ?? []).some((f) => (f.propertyUrl ?? "") === CP.propertyUrl)
  ok(inFavs, "legacy duplicate: Favorites wins — Alta renders as a Favorite")
  ok(!inRecs, "legacy duplicate: the duplicate Recommendation does NOT also render")
}

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
