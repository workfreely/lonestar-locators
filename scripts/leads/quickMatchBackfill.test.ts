// Backfilling the automatic highlights onto Quick Match recommendations a client ALREADY HAS.
//
// The thing this release has to prove is not that it writes the right words — quickMatchHighlights
// is already covered by scripts/leads/quickMatchHighlights.test.ts — but that it writes them
// WITHOUT touching anything else. So most of what follows watches the statements the backfill
// issues through a recording client, and asserts about what is absent from them.
//
// Run: npx tsx scripts/leads/quickMatchBackfill.test.ts
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { backfillQuickMatchHighlights, persistQuickMatch, QUICK_MATCH_ORIGIN } from "@/lib/quickMatch/persist"
import { readScreeningFacts } from "@/lib/quickMatch/eligibility"
import { displayReasons } from "@/lib/leads/bedroomPricing"
import type { QuickMatchProperty } from "@/lib/quickMatch/types"
import type { Recommendation } from "@/lib/quickMatch/ranking"
import { MAX_REASONS } from "@bc/companion-shared"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) }
  else { fail++; console.log(`  ✗ ${l}${detail ? `\n      ${detail}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

// ── A RECORDING SUPABASE CLIENT ──────────────────────────────────────────────────────────────
// Every call is written down verbatim, so a test can assert that a table was never written and
// not merely that the happy path looked right. Nothing here reaches a network or a database.
type Op = {
  table: string
  verb: "select" | "insert" | "update" | "upsert" | "delete"
  filters: Array<[string, string, unknown]>
  payload?: unknown
}

function recorder(tables: Record<string, unknown[]>) {
  const ops: Op[] = []
  const from = (table: string) => {
    const make = (verb: Op["verb"], payload?: unknown) => {
      const op: Op = { table, verb, filters: [], payload }
      ops.push(op)
      const builder: any = {
        eq(col: string, val: unknown) { op.filters.push(["eq", col, val]); return builder },
        is(col: string, val: unknown) { op.filters.push(["is", col, val]); return builder },
        select() { return builder },
        // Awaiting the builder is what runs the statement. Reads answer from `tables`; writes
        // answer with the rows they were given, which is what PostgREST returns on .select().
        then(resolve: (r: { data: unknown; error: null }) => void) {
          if (verb === "select") return resolve({ data: tables[table] ?? [], error: null })
          // canonical_property_key is a GENERATED column: PostgREST returns it on .select()
          // even though the write never sent it. Modelled here, because persistQuickMatch
          // matches its inserted rows back by exactly that column.
          // A delete carries no payload: it answers with the rows it removed, which is none here.
          const rows = (Array.isArray(payload) ? payload : payload == null ? [] : [payload]) as Record<string, unknown>[]
          return resolve({
            data: rows.map((row) => ({
              ...row,
              canonical_property_key:
                row.canonical_property_key
                ?? (typeof row.property_url === "string"
                  ? `pid:${row.property_url.split("place_id:")[1] ?? row.property_url}`
                  : undefined),
            })),
            error: null,
          })
        },
      }
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
  return { client: { from } as any, ops }
}

const touched = (ops: Op[], table: string, verbs: Op["verb"][]) =>
  ops.filter((o) => o.table === table && verbs.includes(o.verb))

// ── LEAD 100'S ACTUAL SHAPE ──────────────────────────────────────────────────────────────────
// Six Quick Match rows, no reasons rows, credit 580, two named areas — read from production on
// 2026-11-08 and restated here as fixtures. No test in this file reaches production.
const prop = (placeId: string, name: string): QuickMatchProperty => ({
  placeId, propertyName: name, address: null, zip: null, websiteUrl: null,
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

const rec = (placeId: string, name: string, band: string, area: string): Recommendation =>
  ({
    property: prop(placeId, name),
    tier: "likely", policyOnRecord: false,
    geo: { band, anchorLabel: area, reason: `in ${area}` },
    assessment: { findings: [], reasons: [], tier: "likely" },
    reasons: [], unverified: [], conflicts: [], conditions: [],
  }) as unknown as Recommendation

/** The six, in the id order the workspace shows them in. */
const SIX = [
  rec("ChIJlUJOAKlgXIYRyCjjga9TDcI", "Preston Peak", "in_area", "Medical Center"),
  rec("ChIJlwBDKBtdXIYRUZJzjC9UlKg", "Stoneybrook", "in_area", "Westover Hills"),
  rec("ChIJq42a1ZhDXIYRtrTF7gbdX7c", "Abacus Alamo Ranch", "adjacent", "Westover Hills"),
  rec("ChIJl2KKrjNgXIYRGP2EAXL3hno", "Indian Hollow", "adjacent", "Medical Center"),
  rec("ChIJqRkNDzeKXIYRN-GXnUuVnqw", "Canyon Point", "nearby", "Medical Center"),
  rec("ChIJqfomHk-KXIYRonV7zQzoDC8", "Stoneleigh", "nearby", "Medical Center"),
]
const KEYS = SIX.map((r) => `pid:${r.property.placeId}`)
const facts = readScreeningFacts({ credit_score: 580, credit_history: "Clean", criminal_background: "None" })

const ownedRows = (keys: string[]) => keys.map((canonical_property_key) => ({ canonical_property_key }))

// tsx compiles these to CJS, where top-level await is unavailable — hence one async main.
async function main() {
  console.log("LEAD 100 — the six existing rows, backfilled:")
  {
    const { client, ops } = recorder({
      lead_recommendations: ownedRows(KEYS),
      lead_property_reasons: [],
    })
    const r = await backfillQuickMatchHighlights(client, { leadId: 100, recommendations: SIX, facts })
    ok("all six are considered", r.considered === 6)
    ok("all six receive highlights", r.highlights.length === 6)
    ok("nothing is skipped", r.skipped.length === 0)
    ok("no error", r.error === null)
    const byKey = new Map(r.highlights.map((h) => [h.canonical_property_key, h.reasons]))
    ok("an in_area property claims membership",
      byKey.get(KEYS[0])?.join(" · ") === "Located in Medical Center · Credit-Friendly")
    ok("an adjacent property does NOT claim membership",
      byKey.get(KEYS[2])?.join(" · ") === "Next to Westover Hills · Credit-Friendly")
    ok("a nearby property does NOT claim membership",
      byKey.get(KEYS[4])?.join(" · ") === "Near Medical Center · Credit-Friendly")
    ok("every line pair is exactly two long, leaving the locator a third",
      r.highlights.every((h) => h.reasons.length === 2))
    ok("no line claims approval",
      r.highlights.every((h) => !/approved|qualif|guarant|accept/i.test(h.reasons.join(" "))))

    console.log("\n  …and the statements it issued:")
    ok("lead_recommendations is READ", touched(ops, "lead_recommendations", ["select"]).length === 1)
    ok("…and never deleted from",
      touched(ops, "lead_recommendations", ["delete"]).length === 0)
    ok("…never inserted into",
      touched(ops, "lead_recommendations", ["insert", "upsert"]).length === 0)
    ok("…and never updated",
      touched(ops, "lead_recommendations", ["update"]).length === 0)
    ok("the ONLY write in the whole operation is lead_property_reasons",
      ops.filter((o) => o.verb !== "select").every((o) => o.table === "lead_property_reasons"))
    const ownedRead = touched(ops, "lead_recommendations", ["select"])[0]
    ok("the rows it reads are scoped to this lead",
      ownedRead.filters.some(([op, col, v]) => op === "eq" && col === "lead_id" && v === 100))
    ok("…and to origin = 'quick_match', so a hand-picked row is out of range",
      ownedRead.filters.some(([op, col, v]) => op === "eq" && col === "origin" && v === QUICK_MATCH_ORIGIN))
    const write = touched(ops, "lead_property_reasons", ["upsert"])[0]
    const columns = new Set((write.payload as Record<string, unknown>[]).flatMap((row) => Object.keys(row)))
    ok("the payload carries the reasons and nothing else",
      [...columns].sort().join(",") === "canonical_property_key,lead_id,reasons,updated_at")
    ok("…so the commute cache cannot be disturbed", !columns.has("commute_minutes") && !columns.has("commute_anchor_place_id"))
    ok("…nor the washer/dryer status", !columns.has("washer_dryer_status"))
    ok("…nor the average-rent figures",
      ![...columns].some((c) => c.startsWith("avg_rent")))
    ok("…and quick_match_at is nowhere in this operation",
      ops.every((o) => o.table !== "leads"))
  }

  console.log("\nSAVED WORDING IS NEVER OVERWRITTEN:")
  {
    // Two of the six already carry a locator's own lines; one of those is a single line, which is
    // still wording and still untouchable.
    const { client, ops } = recorder({
      lead_recommendations: ownedRows(KEYS),
      lead_property_reasons: [
        { canonical_property_key: KEYS[1], reasons: ["Walkable to the hospital", "Covered parking"] },
        { canonical_property_key: KEYS[3], reasons: ["She asked for a yard"] },
      ],
    })
    const r = await backfillQuickMatchHighlights(client, { leadId: 100, recommendations: SIX, facts })
    ok("the four blank pairs are filled", r.highlights.length === 4)
    ok("the two edited pairs are skipped", r.skipped.length === 2)
    ok("…and the reason given is the locator's wording",
      r.skipped.every((s) => s.reason === "has_saved_reasons"))
    ok("…naming the right two pairs",
      r.skipped.map((s) => s.canonical_property_key).sort().join(",") === [KEYS[1], KEYS[3]].sort().join(","))
    const written = touched(ops, "lead_property_reasons", ["upsert"])[0].payload as Record<string, unknown>[]
    ok("neither edited pair appears in the write at all",
      !written.some((row) => row.canonical_property_key === KEYS[1] || row.canonical_property_key === KEYS[3]))
    ok("a single saved line is as protected as three",
      !written.some((row) => row.canonical_property_key === KEYS[3]))
  }

  console.log("\nAN ALL-BLANK ROW IS AN EMPTY ROW:")
  {
    // A row kept alive only by its commute cache has a reasons array of empty strings. It is not a
    // row with something to say, so it is filled rather than protected.
    const { client } = recorder({
      lead_recommendations: ownedRows([KEYS[0]]),
      lead_property_reasons: [{ canonical_property_key: KEYS[0], reasons: ["", "  "] }],
    })
    const r = await backfillQuickMatchHighlights(client, { leadId: 100, recommendations: SIX, facts })
    ok("whitespace is not wording", r.highlights.length === 1)
    ok("…and the row is reported as filled, not skipped", r.skipped.length === 0)
  }

  console.log("\nIDEMPOTENT — RUNNING IT AGAIN CHANGES NOTHING:")
  {
    // The state after the first run: the six now hold the lines the first run wrote.
    const afterFirstRun = KEYS.map((canonical_property_key, i) => ({
      canonical_property_key,
      reasons: [["Located in Medical Center", "Credit-Friendly"], ["Located in Westover Hills", "Credit-Friendly"],
                ["Next to Westover Hills", "Credit-Friendly"], ["Next to Medical Center", "Credit-Friendly"],
                ["Near Medical Center", "Credit-Friendly"], ["Near Medical Center", "Credit-Friendly"]][i],
    }))
    const { client, ops } = recorder({
      lead_recommendations: ownedRows(KEYS),
      lead_property_reasons: afterFirstRun,
    })
    const r = await backfillQuickMatchHighlights(client, { leadId: 100, recommendations: SIX, facts })
    ok("the second run writes nothing", r.highlights.length === 0)
    ok("…issues no write statement at all",
      ops.filter((o) => o.verb !== "select").length === 0)
    ok("…and creates no duplicate row", touched(ops, "lead_property_reasons", ["insert", "upsert"]).length === 0)
    ok("…reporting all six as already worded",
      r.skipped.length === 6 && r.skipped.every((s) => s.reason === "has_saved_reasons"))
    ok("…with the six still considered, so the count is honest", r.considered === 6)
  }

  console.log("\nHAND-PICKED ROWS ARE OUT OF RANGE, NOT MERELY SKIPPED:")
  {
    // The origin filter runs in the database, so a manually selected row is absent from the read
    // that defines the population. There is no code path by which it could be written.
    const { client, ops } = recorder({
      lead_recommendations: ownedRows([KEYS[0]]), // the one Quick Match row; the others are the agent's
      lead_property_reasons: [],
    })
    const r = await backfillQuickMatchHighlights(client, { leadId: 100, recommendations: SIX, facts })
    ok("only the Quick Match row is considered", r.considered === 1)
    ok("…and only it is written", r.highlights.length === 1 && r.highlights[0].canonical_property_key === KEYS[0])
    const written = touched(ops, "lead_property_reasons", ["upsert"])[0].payload as Record<string, unknown>[]
    ok("the engine's other five recommendations are NOT written, though it ranked them",
      written.length === 1)
    ok("…which is what stops the backfill widening the collection",
      !written.some((row) => KEYS.slice(1).includes(String(row.canonical_property_key))))
  }

  console.log("\nA ROW THE ENGINE NO LONGER RANKS IS LEFT ALONE, AND REPORTED:")
  {
    const retired = "pid:ChIJretired000000000000000"
    const { client } = recorder({
      lead_recommendations: ownedRows([KEYS[0], retired]),
      lead_property_reasons: [],
    })
    const r = await backfillQuickMatchHighlights(client, { leadId: 100, recommendations: SIX, facts })
    ok("both rows are counted as considered", r.considered === 2)
    ok("the ranked one is filled", r.highlights.length === 1)
    ok("the unranked one is reported, not silently dropped",
      r.skipped.length === 1 && r.skipped[0].canonical_property_key === retired)
    ok("…with the reason a locator can act on",
      r.skipped[0].reason === "not_currently_ranked")
  }

  console.log("\nA CLIENT WITH NO QUICK MATCH ROWS:")
  {
    const { client, ops } = recorder({ lead_recommendations: [], lead_property_reasons: [] })
    const r = await backfillQuickMatchHighlights(client, { leadId: 101, recommendations: SIX, facts })
    ok("nothing is considered", r.considered === 0)
    ok("nothing is written", r.highlights.length === 0)
    ok("…and the reasons table is never even read",
      ops.every((o) => o.table !== "lead_property_reasons"))
    ok("no error — this is an ordinary outcome", r.error === null)
  }

  console.log("\nNOTHING SUPPORTABLE IS STILL NOTHING:")
  {
    // A client with no credit signal and a property with no recorded policy: no screening label is
    // earned. With the location line also absent, the pair is left blank rather than hedged.
    const bare = readScreeningFacts({})
    const noArea = [{ ...SIX[0], geo: { band: null, anchorLabel: null, reason: null } } as unknown as Recommendation]
    const { client, ops } = recorder({
      lead_recommendations: ownedRows([KEYS[0]]),
      lead_property_reasons: [],
    })
    const r = await backfillQuickMatchHighlights(client, { leadId: 100, recommendations: noArea, facts: bare })
    ok("the pair is left blank", r.highlights.length === 0)
    ok("…and says why", r.skipped.length === 1 && r.skipped[0].reason === "nothing_supportable")
    ok("…issuing no write", touched(ops, "lead_property_reasons", ["upsert"]).length === 0)
  }

  console.log("\nA READ FAILURE CHANGES NOTHING:")
  {
    const client = {
      from: () => ({
        select: () => {
          const b: any = {
            eq: () => b,
            then: (res: (r: { data: null; error: { message: string } }) => void) =>
              res({ data: null, error: { message: "permission denied for table lead_recommendations" } }),
          }
          return b
        },
      }),
    } as any
    const r = await backfillQuickMatchHighlights(client, { leadId: 100, recommendations: SIX, facts })
    ok("the error is reported", r.error !== null)
    ok("…and nothing is claimed as written", r.highlights.length === 0 && r.considered === 0)
  }

  console.log("\nPRICING — DERIVED AT READ TIME, NEVER STORED:")
  {
    const { client } = recorder({ lead_recommendations: ownedRows([KEYS[0]]), lead_property_reasons: [] })
    const r = await backfillQuickMatchHighlights(client, { leadId: 100, recommendations: SIX, facts })
    const stored = r.highlights[0].reasons
    ok("no price is stored", !stored.some((t) => /\$/.test(t)))
    ok("no washer/dryer line is stored", !stored.some((t) => /washer|dryer/i.test(t)))
    // What the card renders from those two stored lines, with and without a verified rent.
    const noPricing = { onebrStartingRent: null, twobrStartingRent: null, threebrStartingRent: null }
    const twoBrPriced = { onebrStartingRent: null, twobrStartingRent: 1679, threebrStartingRent: null }
    const noRent = displayReasons(stored, noPricing, "2", MAX_REASONS)
    ok("with no rent on record: location then screening",
      noRent.join(" · ") === "Located in Medical Center · Credit-Friendly")
    const withRent = displayReasons(stored, twoBrPriced, "2", MAX_REASONS)
    ok("with a rent on record: the price appears BETWEEN them",
      withRent.length === 3 && withRent[0] === "Located in Medical Center"
        && /^2BR from \$1,679/.test(withRent[1]) && withRent[2] === "Credit-Friendly")
    ok("…and the stored row is unchanged by either render", stored.length === 2)
  }

  console.log("\nTHE DRAFT PATH IS UNCHANGED:")
  {
    // persistQuickMatch still inserts, still stands down on a duplicate, and still writes
    // highlights only for what it inserted. The backfill shares its writer, so this guards against
    // the sharing having changed the original behaviour.
    const { client, ops } = recorder({
      lead_recommendations: ownedRows([KEYS[0]]),
      lead_property_reasons: [],
    })
    const r = await persistQuickMatch(client, {
      leadId: 100, recommendations: [SIX[0]], collection: "default", mode: "initial", facts,
    })
    ok("it still reports what it inserted", r.inserted === 1)
    ok("it still writes highlights for an inserted pair", r.highlights.length === 1)
    ok("…in the same two-line shape", r.highlights[0].reasons.length === 2)
    ok("an initial draft still deletes nothing", touched(ops, "lead_recommendations", ["delete"]).length === 0)
  }
  {
    const { client, ops } = recorder({ lead_recommendations: [], lead_property_reasons: [] })
    await persistQuickMatch(client, {
      leadId: 100, recommendations: [SIX[0]], collection: "default", mode: "refresh", facts,
    })
    const del = touched(ops, "lead_recommendations", ["delete"])[0]
    ok("a refresh still deletes, and is still scoped three ways",
      del !== undefined && del.filters.length === 3)
    ok("…by lead, by origin, and by reviewed_at",
      del.filters.some(([o, c]) => o === "eq" && c === "lead_id")
        && del.filters.some(([o, c, v]) => o === "eq" && c === "origin" && v === QUICK_MATCH_ORIGIN)
        && del.filters.some(([o, c, v]) => o === "is" && c === "reviewed_at" && v === null))
  }

  console.log("\nTHE ROUTE — THE BACKFILL CANNOT REACH THE DRAFT'S WRITE CODE:")
  {
    const route = read("app/api/admin/quick-match/[leadId]/route.ts")
    const backfillAt = route.indexOf('if (mode === "backfill")')
    const persistAt = route.indexOf("const persisted = await persistQuickMatch")
    const stampAt = route.indexOf("const stampError = await markQuickMatchRun")
    ok("the backfill branch exists", backfillAt > 0)
    ok("…and returns BEFORE persistQuickMatch is called", backfillAt < persistAt)
    ok("…and before the stamp", backfillAt < stampAt)
    const branch = route.slice(backfillAt, persistAt)
    ok("the branch calls the backfill and nothing else that writes",
      /backfillQuickMatchHighlights/.test(branch)
        && !/persistQuickMatch|markQuickMatchRun/.test(branch))
    ok("…and says plainly that it did not stamp", /stamped: false/.test(branch))
    ok("the stamp guard now applies to the initial pass only",
      /if \(mode === "initial" && alreadyRan\)/.test(route))
    ok("…so an already-run client can still be backfilled",
      !/if \(!wantRefresh && alreadyRan\)/.test(route))
    ok("refresh is still its own mode and still reaches the draft",
      /const wantRefresh = mode === "refresh"/.test(route)
        && /mode: wantRefresh \? "refresh" : "initial"/.test(route))
    ok("only three modes exist", (route.match(/body\?\.mode === "(\w+)"/g) ?? []).length === 2)
  }

  console.log("\nTHE CRM ACTION:")
  {
    const dash = read("components/crm/DashboardClient.tsx")
    ok("the workspace sends mode backfill", /JSON\.stringify\(\{ mode: "backfill" \}\)/.test(dash))
    const handler = dash.slice(dash.indexOf("const handleBackfillHighlights"), dash.indexOf("// Shared by the three EVENTS"))
    ok("…merges the returned lines into the live map", /setReasonsByKey/.test(handler))
    ok("…and does NOT refetch lead_recommendations, because no row changed",
      !/from\("lead_recommendations"\)/.test(handler))
    ok("…nor touch the local recommendations array",
      !/setLocalRecommendations|localRecommendationsRef/.test(handler))
    ok("the automatic draft still sends mode initial", /JSON\.stringify\(\{ mode: "initial" \}\)/.test(dash))
    ok("nothing in the workspace sends mode refresh", !/mode: "refresh"/.test(dash))

    const bm = read("components/crm/BestMatches.tsx")
    ok("the control is offered only for Quick Match rows",
      /String\(r\.origin \?\? ""\) === "quick_match"/.test(bm))
    ok("…only while a row is actually blank",
      /!\(reasonsByKey\?\.get\(key\) \?\? \[\]\)\.some/.test(bm))
    ok("…and only when the caller supplies the action",
      /onBackfillHighlights && backfillableKeys\.length > 0/.test(bm))
    ok("the button is labelled Backfill Highlights", /Backfill Highlights \(\$\{backfillableKeys\.length\}\)/.test(bm))
    ok("the existing reasons editor is untouched — it still saves through onSaveReasons",
      /onSaveReasons/.test(bm) && /ReasonsControl/.test(bm))
    ok("Send List is unchanged and still gated on having recommendations",
      /disabled=\{leadRecommendations\.length === 0\}/.test(bm))
    ok("the backfill control offers no reorder, remove or send",
      !/onReorder|onRemoveRecommendation|onSendRecommendations/.test(
        bm.slice(bm.indexOf("{/* BACKFILL HIGHLIGHTS"), bm.indexOf("{/* Recommendation actions"))))
  }

  console.log("\nTHE RELEASE'S OWN SCOPE GUARD:")
  {
    // Measured against the verified production commit this release was cut from. The point is
    // not that the list is short but that it is CLOSED: a later change that reaches into
    // Unleash Beast, the share flow or the client-facing page fails here rather than shipping.
    const BASELINE = "57ae50f"
    const has = (() => {
      try { execSync(`git cat-file -e ${BASELINE}^{commit}`, { stdio: "ignore" }); return true } catch { return false }
    })()
    if (!has) {
      console.log(`  – skipped: ${BASELINE} is not in this clone`)
    } else {
      // Tracked changes AND files not yet committed, so the guard reads the same before and
      // after the commit — a new file that git has not been told about is still a change.
      const lines = (cmd: string) =>
        execSync(cmd, { encoding: "utf8" }).trim().split("\n").map((l) => l.trim()).filter(Boolean)
      const changed = [...new Set([
        ...lines(`git diff --name-only ${BASELINE} -- . ':!next-env.d.ts'`),
        ...lines("git ls-files --others --exclude-standard"),
      ])].sort()
      const APPROVED = [
        "app/api/admin/quick-match/[leadId]/route.ts", // the backfill mode
        "components/crm/BestMatches.tsx",              // the Backfill Highlights control
        "components/crm/DashboardClient.tsx",          // the handler that calls it
        "lib/quickMatch/persist.ts",                   // backfillQuickMatchHighlights
        "scripts/leads/quickMatchBackfill.test.ts",    // this file
        "scripts/tests/criminalBackground.test.ts",    // its allow-list entry for this file
        // Two suites assert on persist.ts and route.ts BY THEIR SOURCE TEXT, and this release
        // renamed what they match: writeHighlights' guard-1 set, its "never fails" wording, and
        // the stamp guard now reading `mode === "initial"`. Each was re-pointed at the new text
        // and each kept its original claim — nothing was loosened to make it pass.
        "scripts/leads/quickMatchHighlights.test.ts",
        "scripts/tests/quickMatch.test.ts",
      ].sort()
      ok(`exactly the ${APPROVED.length} approved files changed`,
        changed.join(" ") === APPROVED.join(" "), )
      ok("no migration is part of this release", !changed.some((f) => f.startsWith("supabase/")))
      // The named prohibitions, as paths. Each is a directory or file the brief put out of bounds.
      for (const [label, re] of [
        ["Unleash Beast", /unleash|propertyExplorer\/(?!types)/i],
        ["the map and search surfaces", /mapExplorer|components\/explorer|app\/\(site\)/i],
        ["the client-facing recommendation page", /app\/r\/|app\/share|clientShare/i],
        ["the share and send flow", /client-shares|lb_create_client_share|sendList/i],
        ["the Quick Match engine", /lib\/quickMatch\/(eligibility|ranking|geography|screening|collection|buckets|criminal|needs|types|index)\.ts/],
        ["the reasons editor", /ReasonsControl/],
        ["Favorites", /LeadFavorites/],
      ] as const) {
        ok(`${label} is untouched`, !changed.some((f) => re.test(f)))
      }
      // BestMatches and DashboardClient ARE shared with manually selected recommendations, so
      // being in the list is not enough — the change to each has to be purely additive.
      const bmDiff = execSync(`git diff ${BASELINE} -- components/crm/BestMatches.tsx`, { encoding: "utf8" })
      const removedBm = bmDiff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"))
      ok("BestMatches: the change removes nothing at all", removedBm.length === 0, removedBm.join(" | "))
      const dashDiff = execSync(`git diff ${BASELINE} -- components/crm/DashboardClient.tsx`, { encoding: "utf8" })
      const removedDash = dashDiff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"))
      ok("DashboardClient: the change removes nothing at all", removedDash.length === 0, removedDash.join(" | "))
      // persist.ts DOES have removed lines — writeHighlights' return shape changed. Nothing else.
      const persistDiff = execSync(`git diff -U0 ${BASELINE} -- lib/quickMatch/persist.ts`, { encoding: "utf8" })
      const removedPersist = persistDiff.split("\n")
        .filter((l) => l.startsWith("-") && !l.startsWith("---"))
        .map((l) => l.slice(1).trim())
        .filter((l) => l !== "" && !l.startsWith("*") && !l.startsWith("//"))
      ok("persist.ts: nothing removed from the draft's delete or upsert",
        !removedPersist.some((l) => /\.delete\(|\.upsert\(|onConflict|ignoreDuplicates|reviewed_at/.test(l)),
        removedPersist.join(" | "))
    }
  }

  console.log("\nWHAT THIS RELEASE DID NOT TOUCH:")
  {
    // The engine decides eligibility, ranking, geography and selection. The backfill reads its
    // output and writes words; it must not be able to change any of those decisions.
    const persist = read("lib/quickMatch/persist.ts")
    const backfill = persist.slice(persist.indexOf("export async function backfillQuickMatchHighlights"))
    // Comments stripped, so the prose explaining what it does not do cannot satisfy the test.
    const code = backfill.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")
    ok("the backfill runs no engine", !/runQuickMatch|rankCandidates|assessProperty/.test(code))
    ok("…and re-orders nothing", !/\.sort\(|sort_order/.test(code))
    ok("…does not evaluate eligibility", !/evaluateEligibility/.test(backfill))
    ok("…does not read geography", !/geography|resolveClientNeeds/.test(backfill))
    ok("…and writes no sort_order", !/sort_order/.test(backfill))
    for (const f of [
      "lib/quickMatch/eligibility.ts", "lib/quickMatch/ranking.ts", "lib/quickMatch/geography.ts",
      "lib/quickMatch/screening.ts", "lib/quickMatch/collection.ts", "lib/quickMatch/buckets.ts",
      "lib/quickMatch/criminal.ts", "lib/quickMatch/needs.ts", "lib/quickMatch/types.ts",
      "lib/quickMatch/index.ts", "lib/quickMatch/highlights.ts", "lib/leads/locationHighlight.ts",
      "lib/leads/bedroomPricing.ts",
    ]) {
      ok(`${f} carries no reference to the backfill`, !/backfill/i.test(read(f)))
    }
  }

}

main().then(() => {
  console.log(`\nQuick Match backfill: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})
