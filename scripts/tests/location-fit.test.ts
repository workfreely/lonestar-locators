/**
 * Location Fit V1 — conservative, deterministic, market-agnostic location evaluator,
 * now consuming the shared Current Client Context. Pure, no DB:
 *   npx tsx scripts/tests/location-fit.test.ts
 *
 * Row contract: Location: [Fit] · [Detail]   (Fit ∈ Good | Bad | Unverified)
 *   • Good        — a client location term matches the property's area.
 *   • Bad         — reliable structured CITY mismatch (decided FIRST).
 *   • Unverified  — not enough verified info (incl. proximity we can't check w/o Maps).
 *
 * Also covers: resolveClientContext layering (baseline + override text), the Carlos
 * Austin→San-Antonio wrong-city case, proximity preserved verbatim as an Unverified
 * detail (no landmark lookup), and end-to-end payload → context → fit.
 */
import { resolveClientContext, evaluateLocationFit, cityMismatch, propertyCityName } from "@bc/companion-shared"
import { buildActiveClientPayload } from "@/lib/companion/leadToDto"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string) {
  if (cond) pass++
  else {
    fail++
    console.error("✗", name)
  }
}
const eq = (a: unknown, b: unknown, name: string) => ok(a === b, `${name} (got ${JSON.stringify(a)})`)

// Convenience: build context from loose client fields, then evaluate against a property.
const fitFor = (client: any, property: any) => evaluateLocationFit(resolveClientContext(client), property)

// ── Bad · Wrong city — THE canonical Carlos case ──────────────────────────────
{
  const r = fitFor(
    { city: "Austin", desiredAreas: "East Austin" },
    { propertyName: "The Josephine", propertyAddress: "1400 E Houston St, San Antonio, TX 78215" },
  )
  eq(r.verdict, "bad", "Austin client + San Antonio property → bad")
  eq(r.fit, "Bad", "fit word is 'Bad'")
  eq(r.detail, "Wrong city", "detail is exactly 'Wrong city'")
}

// City-only property address ("San Antonio, TX 78215") still parses → Bad.
{
  const r = fitFor({ city: "Austin", desiredAreas: "East Austin" }, { propertyAddress: "San Antonio, TX 78215" })
  eq(r.verdict, "bad", "city-only property address still yields wrong-city")
}

// Off-topic override text must NOT soften an obvious city mismatch.
{
  const r = fitFor(
    { city: "Austin", desiredAreas: "East Austin", locatorNotes: "Prefers a modern build with a gym.", aiInsights: ["Budget flexible."] },
    { propertyAddress: "1400 E Houston St, San Antonio, TX 78215" },
  )
  eq(r.verdict, "bad", "off-topic override does not soften wrong-city")
}

// …but override text that CLEARLY names the property's city suppresses Bad.
{
  const r = fitFor(
    { city: "Austin", desiredAreas: "East Austin", locatorNotes: "Update: now open to San Antonio for a relocation." },
    { propertyName: "The Josephine", propertyAddress: "1400 E Houston St, San Antonio, TX 78215" },
  )
  ok(r.verdict !== "bad", "override naming the property's city suppresses wrong-city Bad")
}

// ── Good · East Austin — same city, desired area matches ──────────────────────
{
  const r = fitFor(
    { city: "Austin", desiredAreas: "East Austin" },
    { propertyName: "Eastside Station", propertySubmarket: "East Austin", propertyAddress: "2010 E 12th St, Austin, TX 78702" },
  )
  eq(r.verdict, "good", "same city + area match → good")
  eq(r.fit, "Good", "fit word is 'Good'")
  eq(r.detail, "East Austin", "detail is the matched area")
}

// Area match via the property NAME (submarket taxonomy may differ) → Good.
{
  const r = fitFor(
    { city: "San Antonio", desiredAreas: "Stone Oak" },
    { propertyName: "Alta Stone Oak", propertySubmarket: "Far North", propertyAddress: "1234 Knights Cross Dr, San Antonio, TX 78258" },
  )
  eq(r.verdict, "good", "area in property name → good")
  eq(r.detail, "Stone Oak", "detail from name match")
}

// Newer AI insight naming the property's area → Good (current override context).
{
  const r = fitFor(
    { city: "San Antonio", desiredAreas: "Downtown", aiInsights: ["Now wants Stone Oak near her sister."] },
    { propertyName: "The Mansions at Stone Oak", propertySubmarket: "Stone Oak", propertyAddress: "1234 Knights Cross Dr, San Antonio, TX 78258" },
  )
  eq(r.verdict, "good", "override area match → good")
  eq(r.detail, "Stone Oak", "detail from the override-layer area")
}

// ── Unverified · No location set ──────────────────────────────────────────────
{
  const r = fitFor({}, { propertyName: "The Josephine", propertyAddress: "1400 E Houston St, San Antonio, TX 78215" })
  eq(r.verdict, "unknown", "no client location → unknown")
  eq(r.fit, "Unverified", "fit word is 'Unverified'")
  eq(r.detail, "No location set", "detail is 'No location set'")
}

// ── Unverified · Near Lackland (proximity, cities match, market-agnostic) ──────
{
  const r = fitFor(
    { city: "San Antonio", locatorNotes: "Needs to be near Lackland." },
    { propertyName: "The Beckett", propertyAddress: "9000 Fountainwood, San Antonio, TX 78233" },
  )
  eq(r.verdict, "unknown", "proximity need → unknown (never good/bad)")
  eq(r.detail, "Near Lackland", "detail quotes the client's phrase verbatim (no '— unverified')")
}

// Invented place we can't possibly 'know' behaves identically (no geo lookup).
{
  const r = fitFor(
    { city: "Denver", locatorNotes: "Wants to be close to Zorptik Campus." },
    { propertyName: "The Beckett", propertyAddress: "9000 Fountainwood, Denver, CO 80014" },
  )
  eq(r.verdict, "unknown", "invented landmark → unknown")
  ok(/zorptik/i.test(r.detail ?? ""), "detail preserves the invented place name")
}

// Generic commute language with no clean object → Unverified with no detail.
{
  const r = fitFor(
    { city: "San Antonio", locatorNotes: "Short commute is the top priority." },
    { propertyName: "The Beckett", propertyAddress: "9000 Fountainwood, San Antonio, TX 78233" },
  )
  eq(r.verdict, "unknown", "generic commute language → unknown")
  eq(r.detail, null, "generic proximity → fit word stands alone (no noisy detail)")
}

// ── Unverified · Area not confirmed — same city, stated area unmatched ─────────
{
  const r = fitFor(
    { city: "Austin", desiredAreas: "Mueller" },
    { propertyName: "The Beckett", propertyAddress: "9000 Fountainwood, Austin, TX 78733" },
  )
  eq(r.verdict, "unknown", "same city but area unmatched → unknown")
  eq(r.detail, "Area not confirmed", "detail is 'Area not confirmed'")
}

// Same city, NO specific area requirement → Good on the city itself.
{
  const r = fitFor({ city: "Austin" }, { propertyName: "The Beckett", propertyAddress: "9000 Fountainwood, Austin, TX 78733" })
  eq(r.verdict, "good", "same city, no area requirement → good")
  eq(r.detail, "Austin", "detail shows the city")
}

// ── SUPERSEDED: a sub-city difference IS a mismatch once SAD gives a usable location ─
// Previously this could never be Bad without a parseable city on either side. SAD's
// Location/Submarket is now the primary property-side signal, so a client who asked for
// "The Pearl" looking at a "Northwest" property is explicitly outside their area — no
// city parsing, and no proximity reasoning, required.
{
  const r = fitFor(
    { desiredAreas: "The Pearl" },
    { propertyName: "Rosemont at Highland Park", propertySubmarket: "Northwest", propertyAddress: "" },
  )
  ok(r.verdict === "bad", "a usable SAD location that matches no desired area → Outside desired area")
  eq(r.detail, "Outside desired area", "…and says so plainly")
}

// ── Containment (not equality) drives the area match ──────────────────────────
{
  const r = fitFor(
    { desiredAreas: "Stone Oak" },
    { propertyName: "The Mansions at Stone Oak", propertyAddress: "1234 Knights Cross Dr, San Antonio, TX 78258" },
  )
  eq(r.verdict, "good", "containment (not equality) drives the match")
}

// ── resolveClientContext layering ─────────────────────────────────────────────
{
  const ctx = resolveClientContext({ city: "Austin", desiredAreas: "East Austin", clientNotes: "form note", locatorNotes: "Confirmed East Austin.", aiInsights: ["Near nightlife.", ""] })
  eq(ctx.city, "Austin", "baseline city preserved")
  eq(ctx.aiInsights.length, 2 - 1, "empty insight sanitized out")
  ok(ctx.overrideText.includes("Confirmed East Austin") && ctx.overrideText.includes("Near nightlife"), "overrideText = locatorNotes + insights")
  ok(!ctx.overrideText.includes("form note"), "clientNotes is NOT in the override layer")
}

// ── Only the three fit words ever appear ──────────────────────────────────────
{
  const words = new Set(
    [
      fitFor({ city: "Austin", desiredAreas: "East Austin" }, { propertyAddress: "x, Austin, TX 78702", propertySubmarket: "East Austin" }),
      fitFor({ city: "Austin" }, { propertyAddress: "x, San Antonio, TX 78215" }),
      fitFor({}, { propertyName: "X" }),
    ].map((r) => r.fit),
  )
  ok([...words].every((w) => w === "Good" || w === "Bad" || w === "Unverified"), "only Good/Bad/Unverified appear")
}

// ── Plumbing: payload → resolveClientContext → fit (end-to-end) ────────────────
{
  const lead = { id: 1, crm_status: "list_sent", city: "Austin", neighborhoods: "East Austin", notes: "Original form note.", locator_notes: "Confirmed: East Austin only." }
  const { lead: dto } = buildActiveClientPayload(lead, [], "Agent", null, "America/Chicago", [], [], [], ["Wants East Austin near the nightlife.", ""])
  eq(dto.locatorNotes, "Confirmed: East Austin only.", "payload carries locatorNotes")
  eq(dto.aiInsights?.length, 1, "payload sanitizes empty insight strings out")
  const r = evaluateLocationFit(
    resolveClientContext({
      city: dto.searchCriteria.city,
      desiredAreas: dto.searchCriteria.desiredAreas,
      clientNotes: dto.clientNotes,
      locatorNotes: dto.locatorNotes,
      aiInsights: dto.aiInsights,
    }),
    { propertyName: "Eastside Station", propertySubmarket: "East Austin", propertyAddress: "2010 E 12th St, Austin, TX 78702" },
  )
  eq(r.verdict, "good", "end-to-end: payload context → good fit")
  eq(r.detail, "East Austin", "end-to-end detail is the area")
}


// ── V1 Location states: Desired area / Outside desired area / excluded ───────
// Explicit matches are credited, explicit mismatches score zero for THIS dimension
// only, and anything we cannot determine is excluded rather than guessed. No mileage,
// drive time, coordinates or "surrounding metro" reasoning is involved.
{
  const client = resolveClientContext({ city: "Austin", desiredAreas: "Downtown Austin" })
  const prop = { propertyAddress: "700 River St, Austin, TX 78701", propertySubmarket: "Downtown" }
  const r = evaluateLocationFit(client, prop as any)
  eq(r.verdict, "good", "Downtown Austin client + Downtown Austin property → Desired area")
  eq(r.detail, "Downtown", "…and the row names the area")
  eq(cityMismatch(client, prop as any), false, "not a mismatch")
}
{
  // Emily Watson vs Alta Berry Creek — the live regression.
  const client = resolveClientContext({ city: "Austin", desiredAreas: "Downtown Austin" })
  const prop = { propertyAddress: "30800 Ronald Reagan Blvd, Georgetown, TX 78633", propertySubmarket: "Georgetown" }
  eq(cityMismatch(client, prop as any), true, "Downtown Austin client + GEORGETOWN property → outside desired area")
  eq(propertyCityName(prop as any), "Georgetown", "the row names the property's own city")
  eq(evaluateLocationFit(client, prop as any).verdict, "bad", "…and it is NOT unknown/excluded")
}
{
  const client = resolveClientContext({ city: "San Antonio", desiredAreas: "Stone Oak" })
  const prop = { propertyAddress: "700 River St, Austin, TX 78701", propertySubmarket: "Downtown" }
  eq(cityMismatch(client, prop as any), true, "San Antonio client + Austin property → outside desired area")
}
{
  // A whole-city preference must not behave as an unmatchable neighborhood.
  const client = resolveClientContext({ city: "Austin", desiredAreas: "All of Austin" })
  const prop = { propertyAddress: "700 River St, Austin, TX 78701", propertySubmarket: "Downtown" }
  const r = evaluateLocationFit(client, prop as any)
  eq(r.verdict, "good", "'All of Austin' + an Austin property → Desired area")
  eq(r.detail, "Austin", "…credited on the city")
}
{
  // Insufficient evidence → EXCLUDED, never guessed. A bare "Downtown" submarket with
  // no city could be any city's downtown.
  const client = resolveClientContext({ city: "Austin", desiredAreas: "Downtown Austin" })
  // True insufficiency = no SAD location AND no parseable city.
  const prop = { propertyAddress: "700 River St", propertySubmarket: null }
  const r = evaluateLocationFit(client, prop as any)
  eq(r.verdict, "unknown", "no SAD location and no city → Location excluded, not guessed")
  eq(cityMismatch(client, prop as any), false, "…and never converted into a mismatch")
}
{
  const client = resolveClientContext({})
  const prop = { propertyAddress: "700 River St, Austin, TX 78701", propertySubmarket: "Downtown" }
  eq(evaluateLocationFit(client, prop as any).verdict, "unknown", "no client location criteria → excluded")
}


// ── V1: SAD's Location/Submarket is the PRIMARY property-side location signal ─
// It is structured intelligence, so it decides the area relationship rather than a
// street address we would have to infer from. Textual normalization only — no
// proximity, distance, coordinates or metro-area reasoning.
{
  const emily = resolveClientContext({ city: "Austin", desiredAreas: "Downtown Austin" })
  const sad = (submarket: string | null, address: string) => ({ propertySubmarket: submarket, propertyAddress: address, propertyName: null }) as any

  // Desired area → full credit, row names SAD's own label
  const a = evaluateLocationFit(emily, sad("Downtown Austin", "700 River St, Austin, TX 78701"))
  eq(a.verdict, "good", "SAD 'Downtown Austin' matches 'Downtown Austin' → Desired area")
  eq(a.detail, "Downtown Austin", "…row shows SAD's location label")

  // "Downtown" ↔ "Downtown Austin" normalization
  const b = evaluateLocationFit(emily, sad("Downtown", "700 River St, Austin, TX 78701"))
  eq(b.verdict, "good", "SAD 'Downtown' normalizes to 'Downtown Austin' → Desired area")

  // Explicit mismatches score zero — NOT unknown
  eq(evaluateLocationFit(emily, sad("Georgetown", "30800 Ronald Reagan Blvd, Georgetown, TX 78633")).verdict, "bad",
     "SAD 'Georgetown' vs 'Downtown Austin' → Outside desired area")
  eq(evaluateLocationFit(emily, sad("Cedar Park", "1200 Cypress Creek Rd, Cedar Park, TX 78613")).verdict, "bad",
     "SAD 'Cedar Park' vs 'Downtown Austin' → Outside desired area, never a match")

  // The SUBMARKET wins over the address city — the reason this rule exists
  const c2 = evaluateLocationFit(emily, sad("Cedar Park", "1200 Cypress Creek Rd, Austin, TX 78613"))
  eq(c2.verdict, "bad", "SAD 'Cedar Park' outranks an Austin address → Outside desired area")
  eq(c2.detail, "Outside desired area", "…and says so plainly")

  // A specific desired area outranks the broad city: an Austin address alone is NOT
  // full credit for someone who asked for Downtown Austin.
  eq(evaluateLocationFit(emily, sad(null, "700 River St, Austin, TX 78701")).verdict, "unknown",
     "no SAD location + specific desired area → excluded, not full credit")
  eq(evaluateLocationFit(emily, sad(null, "700 River St")).verdict, "unknown",
     "no location evidence at all → excluded")
}
{
  // Whole-city and city-only criteria still use the broader city signal.
  const all = resolveClientContext({ city: "Austin", desiredAreas: "All of Austin" })
  const cityOnly = resolveClientContext({ city: "Austin" })
  const prop = { propertySubmarket: "Downtown", propertyAddress: "700 River St, Austin, TX 78701", propertyName: null } as any
  eq(evaluateLocationFit(all, prop).verdict, "good", "'All of Austin' + Austin property → Desired area")
  eq(evaluateLocationFit(cityOnly, prop).verdict, "good", "city-only criterion + Austin property → Desired area")
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
