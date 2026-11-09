// Quick Match — the location highlight after "Near" and "Next to" were retired.
//
// What this release changed, and therefore what this file holds to account:
//
//   Slot one used to be a preposition chosen by a band measured from a neighbourhood CENTROID.
//   It is now one of exactly three things: a MEMBERSHIP claim proved by ZIP, a MEASURED driving
//   time to an approved reference point, or nothing at all.
//
// Run: npx tsx scripts/leads/quickMatchLocationDriveTime.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { isVerifiedInArea, referenceForArea, areaDriveTimeText } from "@/lib/quickMatch/areaReference"
import { resolveAreaDriveTimes } from "@/lib/quickMatch/areaDriveTime"
import { locationHighlight, quickMatchHighlights, type LocationInputs } from "@/lib/quickMatch/highlights"
import { backfillQuickMatchHighlights } from "@/lib/quickMatch/persist"
import { readScreeningFacts } from "@/lib/quickMatch/eligibility"
import { displayReasons } from "@/lib/leads/bedroomPricing"
import { MAX_REASONS } from "@bc/companion-shared"
import type { QuickMatchProperty } from "@/lib/quickMatch/types"
import type { Recommendation } from "@/lib/quickMatch/ranking"

let pass = 0
let fail = 0
const ok = (what: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ✓ ${what}`) } else { fail++; console.log(`  ✗ ${what}`) }
}
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8")
/** Source with comments removed, so an assertion cannot be satisfied by prose about the code. */
const strip = (src: string) =>
  src.split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*")).join("\n")

// Routes must never be reached from this suite. Without a key driveTimesToAnchor throws
// RoutesConfigError, which is exactly the failure path asserted below.
delete process.env.GOOGLE_PLACES_API_KEY

// ── FIXTURES ─────────────────────────────────────────────────────────────────────────────────
// Lead 100's six, with the ZIPs and place_ids production actually holds, read on 2026-11-08.
const prop = (placeId: string, name: string, zip: string | null): QuickMatchProperty => ({
  placeId, propertyName: name, address: null, zip, websiteUrl: null,
  imageUrl: null, googleRating: null, currentSpecial: null, quickMatchCollection: "default",
  creditMinimumStatus: null, creditMinimumScore: null, creditObservedApprovalScore: null,
  creditScreeningNotes: null,
  brokenLeaseStatus: null, brokenLeaseMinAgeYears: null, brokenLeaseBalanceRequirement: null,
  brokenLeaseMaxBalance: null, brokenLeasePositiveHistoryRequired: null,
  evictionStatus: null, evictionMinAgeYears: null, evictionBalanceRequirement: null,
  evictionPositiveHistoryRequired: null,
  rentalDebtStatus: null, rentalDebtBalanceRequirement: null, rentalDebtMaxBalance: null,
  felonyPolicy: null, felonyMinAgeYears: null, felonyRestrictions: null,
  misdemeanorPolicy: null, misdemeanorMinAgeYears: null, misdemeanorRestrictions: null,
  criminalRestrictedOffenseTypes: null, criminalLookbackBasis: null, backgroundScreeningNotes: null,
  screeningAdditionalDeposit: null, screeningRiskFee: null, screeningGuarantorProgram: null,
  screeningRequirementsCheckedAt: null,
  bedsMin: null, bedsMax: null, onebrStartingRent: null, twobrStartingRent: null,
  threebrStartingRent: null, rentMin: null, latitude: 29.5, longitude: -98.5,
}) as QuickMatchProperty

const rec = (placeId: string, name: string, band: string, area: string, zip: string | null): Recommendation =>
  ({
    property: prop(placeId, name, zip),
    tier: "likely", policyOnRecord: false,
    geo: { band, anchorLabel: area, reason: `in ${area}` },
    assessment: { findings: [], reasons: [], tier: "likely" },
    reasons: [], unverified: [], conflicts: [], conditions: [],
  }) as unknown as Recommendation

const PRESTON = "ChIJlUJOAKlgXIYRyCjjga9TDcI"
const STONEYBROOK = "ChIJlwBDKBtdXIYRUZJzjC9UlKg"
const ABACUS = "ChIJq42a1ZhDXIYRtrTF7gbdX7c"
const INDIAN = "ChIJl2KKrjNgXIYRGP2EAXL3hno"
const CANYON = "ChIJqRkNDzeKXIYRN-GXnUuVnqw"
const STONELEIGH = "ChIJqfomHk-KXIYRonV7zQzoDC8"

const SIX = [
  rec(PRESTON, "Preston Peak", "in_area", "Medical Center", "78229"),
  rec(STONEYBROOK, "Stoneybrook", "in_area", "Westover Hills", "78238"),
  rec(ABACUS, "Abacus Alamo Ranch", "adjacent", "Westover Hills", "78253"),
  rec(INDIAN, "Indian Hollow", "adjacent", "Medical Center", "78216"),
  rec(CANYON, "Canyon Point", "nearby", "Medical Center", "78232"),
  rec(STONELEIGH, "Stoneleigh", "nearby", "Medical Center", "78232"),
]
const KEYS = SIX.map((r) => `pid:${r.property.placeId}`)
const facts = readScreeningFacts({ credit_score: 580, credit_history: "Clean", criminal_background: "None" })

const LOC: LocationInputs = {
  market: "San Antonio",
  requestedAreas: ["Westover Hills", "Medical Center"],
  driveTimeLineByPlaceId: new Map([
    [STONEYBROOK, "9 min to Westover Hills"],
    [ABACUS, "11 min to Westover Hills"],
    [INDIAN, "12 min to Medical Center"],
    [CANYON, "18 min to Medical Center"],
    [STONELEIGH, "17 min to Medical Center"],
  ]),
}

// ── A RECORDING SUPABASE CLIENT ──────────────────────────────────────────────────────────────
type Op = { table: string; verb: "select" | "insert" | "update" | "upsert" | "delete"; payload?: unknown }

function recorder(tables: Record<string, Record<string, unknown>[]>) {
  const ops: Op[] = []
  const from = (table: string) => {
    const make = (verb: Op["verb"], payload?: unknown) => {
      ops.push({ table, verb, payload })
      const rows = verb === "select" ? (tables[table] ?? []) : (Array.isArray(payload) ? payload : payload == null ? [] : [payload])
      const builder: Record<string, unknown> = {}
      for (const k of ["eq", "in", "is", "not", "order", "limit"]) builder[k] = () => builder
      builder.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null })
      builder.select = () => builder
      builder.then = (res: (r: { data: unknown; error: null }) => void) => res({ data: rows, error: null })
      return builder
    }
    return {
      select: () => make("select"),
      insert: (p: unknown) => make("insert", p),
      update: (p: unknown) => make("update", p),
      upsert: (p: unknown) => make("upsert", p),
      delete: () => make("delete"),
    }
  }
  return { client: { from } as never, ops }
}
const touched = (ops: Op[], table: string, verbs: Op["verb"][]) =>
  ops.filter((o) => o.table === table && verbs.includes(o.verb))

async function main() {
  console.log("MEMBERSHIP IS PROVED BY ZIP, OR IT IS NOT PROVED:")
  {
    ok("a listed ZIP proves membership", isVerifiedInArea("San Antonio", "Medical Center", "78229"))
    ok("…and so does the other area's", isVerifiedInArea("San Antonio", "Westover Hills", "78251"))
    ok("spelling and case do not matter", isVerifiedInArea("San Antonio", "  medical center ", "78229"))
    ok("a ZIP in the WRONG area is not membership",
      !isVerifiedInArea("San Antonio", "Westover Hills", "78229"))
    ok("an unlisted ZIP is not membership", !isVerifiedInArea("San Antonio", "Medical Center", "78238"))
    ok("no ZIP is not membership", !isVerifiedInArea("San Antonio", "Medical Center", null))
    ok("a malformed ZIP is not membership", !isVerifiedInArea("San Antonio", "Medical Center", "782"))
    // The market scoping is the guard against "Medical Center" meaning two different districts.
    ok("another market's client cannot borrow this one's table",
      !isVerifiedInArea("Houston", "Medical Center", "78229"))
    ok("an unknown market proves nothing", !isVerifiedInArea(null, "Medical Center", "78229"))
    ok("an area nobody reviewed proves nothing",
      !isVerifiedInArea("San Antonio", "Alamo Ranch", "78253"))
  }

  console.log("\nTHE REFERENCE POINTS ARE THE APPROVED ONES, AND ONLY THOSE:")
  {
    const mc = referenceForArea("San Antonio", "Medical Center")
    const wh = referenceForArea("San Antonio", "Westover Hills")
    ok("Medical Center measures to University Hospital",
      mc?.landmarkName === "University Hospital" && mc?.placeId === "ChIJVSW2JPldXIYR5YQfQaiWYC0")
    ok("Westover Hills measures to Westover Sports Complex",
      wh?.landmarkName === "Westover Sports Complex" && wh?.placeId === "ChIJy3zdzKxDXIYR8paHAk340-4")
    ok("each one documents what the drive time measures",
      (mc?.measures ?? "").includes("4502 Medical Dr") && (wh?.measures ?? "").includes("Westover Hills Blvd"))
    ok("an unreviewed area has no reference point", referenceForArea("San Antonio", "Alamo Ranch") === null)
    ok("another market has none of these", referenceForArea("Houston", "Medical Center") === null)
    // The two rejected candidates must not appear anywhere: a street and an ambiguous hospital.
    const refSrc = strip(read("lib/quickMatch/areaReference.ts"))
    ok("the street Google returned for Westover Hills is not used",
      !refSrc.includes("ChIJFROTPt1CXIYRUrn0Z-S_dlE"))
    ok("neither same-named Medical Center hospital is used",
      !refSrc.includes("ChIJf0bjS1ZnXIYRWkDSqYRIG8w") && !refSrc.includes("ChIJ121jQwBeXIYRLoN0wvKpHg8"))
  }

  console.log("\nTHE DRIVE-TIME WORDING:")
  {
    ok("it names the area the client asked for", areaDriveTimeText(11, "Medical Center") === "11 min to Medical Center")
    ok("it rounds to whole minutes", areaDriveTimeText(11.4, "Medical Center") === "11 min to Medical Center")
    ok("no figure, no line", areaDriveTimeText(null, "Medical Center") === null)
    ok("a zero is not a drive time", areaDriveTimeText(0, "Medical Center") === null)
    ok("nor is a negative one", areaDriveTimeText(-3, "Medical Center") === null)
    ok("nor a non-finite one", areaDriveTimeText(Number.NaN, "Medical Center") === null)
    ok("no area label, no line", areaDriveTimeText(11, "   ") === null)
    ok("a ZIP anchor gets no sentence about a postal code", areaDriveTimeText(11, "ZIP 78229") === null)
    // The editor caps a reason at 40 characters; a line it could not re-type is not written.
    ok("a label too long for the editor is refused",
      areaDriveTimeText(11, "A".repeat(40)) === null)
    ok("…and every line this release actually writes fits",
      ["11 min to Medical Center", "9 min to Westover Hills", "Located in Medical Center"]
        .every((t) => t.length <= 40))
    ok("the editor's cap is still 40, which is what that budget is measured against",
      /maxLength=\{40\}|maxLength={40}/.test(read("components/crm/ReasonsControl.tsx")))
  }

  console.log("\nNO PREPOSITION IS GENERATED, IN ANY BAND:")
  {
    for (const band of ["adjacent", "nearby", "destination_zip", "in_area"]) {
      const r = rec("pid-x", "Somewhere", band, "Medical Center", "78216")
      const line = locationHighlight(r, { ...LOC, driveTimeLineByPlaceId: new Map() })
      ok(`band ${band} with no measured figure says nothing at all`, line === null)
    }
    ok("the generator cannot produce Near or Next to",
      SIX.every((r) => {
        const t = locationHighlight(r, LOC) ?? ""
        return !/^(?:Near|Next to)\b/.test(t)
      }))
    const gen = strip(read("lib/quickMatch/highlights.ts"))
    ok("…and it no longer hands the band to the wording function",
      !/areaHighlightText\(\s*r\.geo\.band/.test(gen) && /areaHighlightText\("in_area"/.test(gen))
  }

  console.log("\nTHE PRIORITY ORDER:")
  {
    // Rule 1 over rule 2: a proved member is never described by a drive time.
    ok("proved membership outranks a measured drive time",
      locationHighlight(SIX[0], {
        ...LOC,
        driveTimeLineByPlaceId: new Map([[PRESTON, "3 min to Medical Center"]]),
      }) === "Located in Medical Center")
    ok("membership is checked across EVERY requested area",
      locationHighlight(
        rec("pid-y", "Elsewhere", "nearby", "Medical Center", "78251"),
        LOC,
      ) === "Located in Westover Hills")
    // Rule 2 where membership fails.
    ok("an unproved property gets its measured figure",
      locationHighlight(SIX[1], LOC) === "9 min to Westover Hills")
    // Rule 4.
    ok("no membership and no figure leaves the slot editable",
      locationHighlight(SIX[1], { ...LOC, driveTimeLineByPlaceId: new Map() }) === null)
  }

  console.log("\nTHE CACHE IS CHECKED BEFORE GOOGLE, AND ANSWERS ON ITS OWN:")
  {
    const LM = "97e2792a-3ecb-4557-b82f-bf1dccada96a"
    const { client, ops } = recorder({
      location_landmarks: [{ id: LM, google_place_id: "ChIJy3zdzKxDXIYR8paHAk340-4" }],
      // 9 minutes, stored as the seconds this release writes.
      property_landmark_metrics: [{ place_id: STONEYBROOK, landmark_id: LM, drive_seconds: 540 }],
    })
    const out = await resolveAreaDriveTimes("San Antonio", [
      { propertyPlaceId: STONEYBROOK, areaLabel: "Westover Hills" },
    ], client)
    ok("the cached figure is returned", out.byProperty.get(STONEYBROOK)?.minutes === 9)
    ok("…and counted as a cache hit", out.fromCache === 1 && out.computed === 0)
    ok("NO Routes request is issued at all", out.routesRequests === 0)
    ok("nothing is written when everything was cached",
      touched(ops, "property_landmark_metrics", ["insert", "upsert", "update"]).length === 0)
    ok("the reference point is reported with the figure",
      out.byProperty.get(STONEYBROOK)?.reference.landmarkName === "Westover Sports Complex")
  }

  console.log("\nAN AREA WITH NO APPROVED REFERENCE IS NEVER SENT TO GOOGLE:")
  {
    const { client, ops } = recorder({ location_landmarks: [], property_landmark_metrics: [] })
    const out = await resolveAreaDriveTimes("San Antonio", [
      { propertyPlaceId: ABACUS, areaLabel: "Alamo Ranch" },
    ], client)
    ok("it is reported as having no reference",
      out.misses.length === 1 && out.misses[0].why === "no_reference")
    ok("no landmark lookup even happens", ops.length === 0)
    ok("and no figure is invented", out.byProperty.size === 0)
  }

  console.log("\nAN APPROVED REFERENCE MISSING FROM THE BANK IS REPORTED, NOT CREATED:")
  {
    const { client, ops } = recorder({ location_landmarks: [], property_landmark_metrics: [] })
    const out = await resolveAreaDriveTimes("San Antonio", [
      { propertyPlaceId: INDIAN, areaLabel: "Medical Center" },
    ], client)
    ok("it is reported as missing", out.misses.length === 1 && out.misses[0].why === "landmark_missing")
    ok("nothing is inserted into the landmark bank on the fly",
      touched(ops, "location_landmarks", ["insert", "upsert"]).length === 0)
  }

  console.log("\nONE REQUEST PER DESTINATION, AND A ROUTES FAILURE CHANGES NOTHING:")
  {
    const MC = "11111111-1111-1111-1111-111111111111"
    const WH = "22222222-2222-2222-2222-222222222222"
    const { client, ops } = recorder({
      location_landmarks: [
        { id: MC, google_place_id: "ChIJVSW2JPldXIYR5YQfQaiWYC0" },
        { id: WH, google_place_id: "ChIJy3zdzKxDXIYR8paHAk340-4" },
      ],
      property_landmark_metrics: [],
    })
    const out = await resolveAreaDriveTimes("San Antonio", [
      { propertyPlaceId: INDIAN, areaLabel: "Medical Center" },
      { propertyPlaceId: CANYON, areaLabel: "Medical Center" },
      { propertyPlaceId: STONELEIGH, areaLabel: "Medical Center" },
      { propertyPlaceId: STONEYBROOK, areaLabel: "Westover Hills" },
      { propertyPlaceId: ABACUS, areaLabel: "Westover Hills" },
    ], client)
    // No API key in this process, so driveTimesToAnchor throws and every pair is a miss.
    ok("every pair is reported, none silently dropped", out.misses.length === 5)
    ok("…with the reason naming the Routes failure",
      out.misses.every((m) => m.why === "routes_failed"))
    ok("no minutes are invented when Google could not be asked", out.byProperty.size === 0)
    ok("and nothing is cached from a failure",
      touched(ops, "property_landmark_metrics", ["insert", "upsert"]).length === 0)
    // Five properties, two destinations: the cache was consulted once per destination, not once
    // per property. That grouping is what keeps the request count at one per destination.
    ok("the cache was read once per destination, not once per property",
      touched(ops, "property_landmark_metrics", ["select"]).length === 2)
    const src = strip(read("lib/quickMatch/areaDriveTime.ts"))
    ok("Routes is asked only about pairs with no cached figure",
      /const stale = group\.placeIds\.filter\(\(id\) => !byProperty\.has\(id\)\)/.test(src)
      && /driveTimesToAnchor\(stale\.map/.test(src))
    ok("it reuses the one shared Routes caller and defines no second one",
      /from "@\/lib\/commute\/routes"/.test(src) && !/computeRouteMatrix|routes\.googleapis\.com/.test(src))
  }

  console.log("\nTHE CORRECTION — ONLY LINES THIS SYSTEM CAN PROVE IT WROTE:")
  {
    const { client, ops } = recorder({
      lead_recommendations: KEYS.map((canonical_property_key) => ({ canonical_property_key, origin: "quick_match" })),
      lead_property_reasons: [
        // The four retired prepositions and one unverifiable membership claim, as production held
        // them before this release, plus one line a locator typed.
        { canonical_property_key: KEYS[0], reasons: ["Located in Medical Center", "Credit-Friendly"] },
        { canonical_property_key: KEYS[1], reasons: ["Located in Westover Hills", "Credit-Friendly"] },
        { canonical_property_key: KEYS[2], reasons: ["Next to Westover Hills", "Credit-Friendly"] },
        { canonical_property_key: KEYS[3], reasons: ["Next to Medical Center", "Credit-Friendly"] },
        { canonical_property_key: KEYS[4], reasons: ["Near Medical Center", "Credit-Friendly"] },
        { canonical_property_key: KEYS[5], reasons: ["Great value for the area", "Credit-Friendly"] },
      ],
    })
    const r = await backfillQuickMatchHighlights(client, { leadId: 100, recommendations: SIX, facts, loc: LOC })
    const byKey = new Map(r.corrected.map((c) => [c.canonical_property_key, c]))

    ok("the verified membership claim is left exactly as it is",
      !byKey.has(KEYS[0]) && r.skipped.some((s) => s.canonical_property_key === KEYS[0] && s.reason === "already_correct"))
    ok("the UNVERIFIABLE membership claim becomes a measured figure",
      byKey.get(KEYS[1])?.before === "Located in Westover Hills"
      && byKey.get(KEYS[1])?.after === "9 min to Westover Hills")
    ok("a 'Next to' becomes a measured figure",
      byKey.get(KEYS[2])?.after === "11 min to Westover Hills")
    ok("…and so does a 'Near'", byKey.get(KEYS[4])?.after === "18 min to Medical Center")
    ok("the locator's own line is NOT touched",
      !byKey.has(KEYS[5])
      && r.skipped.some((s) => s.canonical_property_key === KEYS[5] && s.reason === "no_generated_location_line"))

    // The screening highlight is in every corrected array, in its original place.
    ok("Credit-Friendly survives every correction",
      r.corrected.every((c) => c.reasons[c.reasons.length - 1] === "Credit-Friendly"))
    ok("the location line keeps its index", r.corrected.every((c) => c.reasons[0] === c.after))
    // The array can shrink but never grow — this is what protects the price slot.
    ok("no corrected array is longer than it was", r.corrected.every((c) => c.reasons.length <= 2))
    const written = touched(ops, "lead_property_reasons", ["upsert"]).flatMap(
      (o) => (o.payload as Record<string, unknown>[]) ?? [],
    )
    ok("only the reasons column is ever sent",
      written.every((row) => Object.keys(row).sort().join(",") === "canonical_property_key,lead_id,reasons,updated_at"))
    ok("lead_recommendations is never written on this path",
      touched(ops, "lead_recommendations", ["insert", "update", "upsert", "delete"]).length === 0)
    ok("…and neither is the commute cache, the washer/dryer or the rent columns",
      !written.some((row) => "commute_minutes" in row || "washer_dryer_status" in row || "avg_rent_1br" in row))
  }

  console.log("\nNOTHING VERIFIABLE MEANS THE LINE GOES, LEAVING THE SLOT EDITABLE:")
  {
    const { client } = recorder({
      lead_recommendations: [{ canonical_property_key: KEYS[4], origin: "quick_match" }],
      lead_property_reasons: [{ canonical_property_key: KEYS[4], reasons: ["Near Medical Center", "Credit-Friendly"] }],
    })
    // No measured figure for this property, and its ZIP proves nothing.
    const r = await backfillQuickMatchHighlights(client, {
      leadId: 100, recommendations: SIX, facts,
      loc: { ...LOC, driveTimeLineByPlaceId: new Map() },
    })
    const c = r.corrected.find((x) => x.canonical_property_key === KEYS[4])
    ok("the approximation is removed", c?.before === "Near Medical Center" && c?.after === null)
    ok("…and the screening line is all that remains",
      c?.reasons.join("|") === "Credit-Friendly")
    ok("the array shrank rather than carrying a hedge", (c?.reasons.length ?? 9) === 1)
  }

  console.log("\nIDEMPOTENT — A SECOND RUN CHANGES NOTHING:")
  {
    const settled = [
      { canonical_property_key: KEYS[0], reasons: ["Located in Medical Center", "Credit-Friendly"] },
      { canonical_property_key: KEYS[1], reasons: ["9 min to Westover Hills", "Credit-Friendly"] },
      { canonical_property_key: KEYS[2], reasons: ["11 min to Westover Hills", "Credit-Friendly"] },
      { canonical_property_key: KEYS[3], reasons: ["12 min to Medical Center", "Credit-Friendly"] },
      { canonical_property_key: KEYS[4], reasons: ["18 min to Medical Center", "Credit-Friendly"] },
      { canonical_property_key: KEYS[5], reasons: ["17 min to Medical Center", "Credit-Friendly"] },
    ]
    const { client, ops } = recorder({
      lead_recommendations: KEYS.map((canonical_property_key) => ({ canonical_property_key, origin: "quick_match" })),
      lead_property_reasons: settled,
    })
    const r = await backfillQuickMatchHighlights(client, { leadId: 100, recommendations: SIX, facts, loc: LOC })
    ok("nothing is corrected", r.corrected.length === 0)
    ok("nothing is written", r.highlights.length === 0)
    ok("…and no write statement is issued at all",
      ops.filter((o) => o.verb !== "select").length === 0)
    ok("every pair is reported as already right",
      r.skipped.length === 6 && r.skipped.every((s) => s.reason === "already_correct"))
    // A re-run recognises its OWN drive-time wording, which is where idempotence comes from.
    ok("a drive-time line is recognised as this system's own",
      r.skipped.some((s) => s.canonical_property_key === KEYS[3]))
  }

  console.log("\nA SAVED COMMUTE DESTINATION OUTRANKS AN AREA (RULE 3):")
  {
    const { client, ops } = recorder({
      lead_recommendations: KEYS.map((canonical_property_key) => ({ canonical_property_key, origin: "quick_match" })),
      lead_property_reasons: [
        { canonical_property_key: KEYS[2], reasons: ["Next to Westover Hills", "Credit-Friendly"] },
      ],
    })
    const r = await backfillQuickMatchHighlights(client, {
      leadId: 100, recommendations: SIX, facts, loc: LOC, anchoredElsewhere: true,
    })
    ok("the correction stands down entirely", r.corrected.length === 0)
    ok("…touching no existing line", !touched(ops, "lead_property_reasons", ["upsert"])
      .flatMap((o) => (o.payload as Record<string, unknown>[]) ?? [])
      .some((row) => row.canonical_property_key === KEYS[2]))
    const route = strip(read("app/api/admin/quick-match/[leadId]/route.ts"))
    ok("the route computes no area drive times for an anchored client",
      /if \(anchoredElsewhere\) return \{ loc: empty/.test(route))
    ok("…and the commute pass's own precedence is untouched",
      /reasons\[area\] = text/.test(read("lib/commute/commuteReason.ts")))
  }

  console.log("\nPRICING IS UNTOUCHED — STILL DERIVED AT READ TIME:")
  {
    const written = quickMatchHighlights(SIX[0], facts, LOC)
    ok("two lines are stored, never three", written.length === 2)
    ok("no price is stored", !written.some((t) => t.includes("$")))
    const shown = displayReasons(
      written, { onebrStartingRent: null, twobrStartingRent: 1679, threebrStartingRent: null },
      "2BR", MAX_REASONS,
    )
    ok("the composer still lands the price in the middle",
      shown.join("|") === "Located in Medical Center|2BR from $1,679/month|Credit-Friendly")
    const withDrive = quickMatchHighlights(SIX[3], facts, LOC)
    ok("…and does the same beside a drive time",
      displayReasons(withDrive, { onebrStartingRent: null, twobrStartingRent: 1679, threebrStartingRent: null }, "2BR", MAX_REASONS)
        .join("|") === "12 min to Medical Center|2BR from $1,679/month|Credit-Friendly")
    const refSrc = read("lib/quickMatch/areaReference.ts") + read("lib/quickMatch/areaDriveTime.ts")
    ok("neither new module reads or writes a rent figure",
      !/StartingRent|rent_min|avg_rent|desired_rent/.test(refSrc))
  }

  console.log("\nTHE SERVICE ROLE IS CONFINED TO ONE MODULE:")
  {
    const route = strip(read("app/api/admin/quick-match/[leadId]/route.ts"))
    ok("the route itself never reaches for it",
      !/supabaseAdmin|SERVICE_ROLE/.test(route))
    ok("persist.ts never reaches for it either",
      !/supabaseAdmin|SERVICE_ROLE/.test(strip(read("lib/quickMatch/persist.ts"))))
    const dt = strip(read("lib/quickMatch/areaDriveTime.ts"))
    ok("areaDriveTime.ts is the only place it appears", /supabaseAdmin/.test(dt))
    ok("…and the import is lazy, so importing the module constructs nothing privileged",
      /await import\("@\/lib\/supabase\/admin"\)/.test(dt))
    // The two tables it may reach are global property data, not client data.
    const tables = [...dt.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1])
    ok("it touches only the two global landmark tables",
      [...new Set(tables)].sort().join(",") === "location_landmarks,property_landmark_metrics")
    ok("it can never read a client's rows",
      !/lead_recommendations|lead_property_reasons|lead_favorites|\bleads\b/.test(dt))
  }

  console.log("\nWHAT THIS RELEASE DID NOT TOUCH:")
  {
    const BASELINE = "a5c58e2"
    const has = (() => {
      try { execSync(`git cat-file -e ${BASELINE}^{commit}`, { stdio: "ignore" }); return true } catch { return false }
    })()
    if (!has) {
      console.log(`  – skipped: ${BASELINE} is not in this clone`)
    } else {
      const lines = (cmd: string) =>
        execSync(cmd, { encoding: "utf8" }).trim().split("\n").map((l) => l.trim()).filter(Boolean)
      // Tracked changes AND files git has not been told about, so the guard reads the same
      // before and after the commit.
      const changed = [...new Set([
        ...lines(`git diff --name-only ${BASELINE} -- . ':!next-env.d.ts'`),
        ...lines("git ls-files --others --exclude-standard"),
      ])].sort()
      const APPROVED = [
        "app/api/admin/quick-match/[leadId]/route.ts",            // builds the location inputs
        "components/crm/BestMatches.tsx",                         // the control's gate and note
        "components/crm/DashboardClient.tsx",                     // merges the corrected rows
        "lib/quickMatch/areaDriveTime.ts",                        // new: cache + the one Routes caller
        "lib/quickMatch/areaReference.ts",                        // new: the two curated tables
        "lib/quickMatch/highlights.ts",                           // membership or a figure, nothing else
        "lib/quickMatch/persist.ts",                              // correctLocationHighlights
        "scripts/leads/quickMatchLocationDriveTime.test.ts",      // this file
        // Three suites assert on behaviour this release deliberately changed, and each was
        // re-pointed at the new truth with its original claim intact — the backfill suite's own
        // scope guard is now pinned to its release tip so it describes what it shipped, and the
        // highlights suite's fixtures carry the ZIPs that now earn a membership claim.
        "scripts/leads/quickMatchBackfill.test.ts",
        "scripts/leads/quickMatchHighlights.test.ts",
        "scripts/tests/criminalBackground.test.ts",               // its allow-list entry for this file
      ].sort()
      ok(`exactly the ${APPROVED.length} approved files changed`,
        changed.join(" ") === APPROVED.join(" "))
      ok("no migration is part of this release", !changed.some((f) => f.startsWith("supabase/")))

      for (const [label, re] of [
        ["Unleash Beast", /unleash|propertyExplorer\/(?!multiArea|types)/i],
        ["Map Explorer and the search surfaces", /mapExplorer|components\/explorer|app\/\(site\)/i],
        ["the client-facing recommendation page", /app\/r\/|app\/share|clientShare/i],
        ["the share and send flow", /client-shares|lb_create_client_share|sendList/i],
        ["the commute pass and its module", /lib\/commute\/|app\/api\/admin\/leads\/commute/],
        ["the Quick Match engine", /lib\/quickMatch\/(eligibility|ranking|geography|screening|collection|buckets|criminal|needs|types|index)\.ts/],
        ["the shared location wording module", /lib\/leads\/locationHighlight\.ts/],
        ["pricing", /bedroomPricing/],
        ["the reasons editor", /ReasonsControl/],
        ["Favorites", /LeadFavorites/],
      ] as const) {
        ok(`${label} is untouched`, !changed.some((f) => re.test(f)))
      }

      // The two shared CRM components serve manually selected recommendations as well, so the
      // diff must ADD and never remove — except the two gate lines this release deliberately
      // replaced, which are named here rather than waved through.
      for (const f of ["components/crm/DashboardClient.tsx", "components/crm/BestMatches.tsx"]) {
        const removed = lines(`git diff --unified=0 ${BASELINE} -- ${f}`)
          .filter((l) => l.startsWith("-") && !l.startsWith("---"))
        const allowed = f.endsWith("BestMatches.tsx") ? 8 : 6
        ok(`${f} removes at most the lines this release replaces`, removed.length <= allowed)
        ok(`…and removes nothing to do with a property row in ${path.basename(f)}`,
          !removed.some((l) => /lead_recommendations|sort_order|localRecommendations|onReorder|origin/.test(l)))
      }

      // The engine files must not merely be unchanged — they must not know this exists.
      for (const f of [
        "lib/quickMatch/eligibility.ts", "lib/quickMatch/ranking.ts", "lib/quickMatch/geography.ts",
        "lib/quickMatch/collection.ts", "lib/quickMatch/needs.ts", "lib/quickMatch/types.ts",
      ]) {
        ok(`${f} carries no reference to the location correction`,
          !/areaReference|areaDriveTime|driveTimesToAnchor|isVerifiedInArea/.test(read(f)))
      }
    }
  }

  console.log(`\nQuick Match location drive time: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => { console.error(err); process.exit(1) })
