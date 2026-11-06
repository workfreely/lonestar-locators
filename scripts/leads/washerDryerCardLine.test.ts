// WASHER & DRYER ON THE CARD — precedence, vocabulary, and what stays silent.
//
// Run: npx tsx scripts/leads/washerDryerCardLine.test.ts   (pure — reads source, no network)
//
// Two facts, two homes, and the whole point of these assertions is that they do not merge:
//   lead_property_reasons.washer_dryer_status   confirmed for ONE client and ONE property
//   property_catalog.washer_dryer_*             recorded about the property, four states
// The card shows one line. The confirmation wins it; the catalog fills in when there is none;
// neither reaches the renter, whose pill still renders only from a confirmation.
import { readFileSync } from "node:fs"
import { washerDryerCardLine, loadCatalogWasherDryer } from "@/lib/propertyIntel/washerDryerCatalog"

const read = (p: string) => readFileSync(p, "utf8")
let pass = 0, fail = 0
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${what}`) }
  else { fail++; console.log(`  FAIL ${what}${detail ? `  — ${detail}` : ""}`) }
}
const line = (c: Parameters<typeof washerDryerCardLine>[0], k: Parameters<typeof washerDryerCardLine>[1]) =>
  washerDryerCardLine(c, k)

console.log("\nWASHER & DRYER — the standard-detail line\n")

// ── PRECEDENCE: A PERSON OUTRANKS THE CATALOG ──────────────────────────────────────────────
ok("a confirmed status wins outright",
  line("included", { included: "No", connections: null })?.text === "Washer & Dryer Included")
ok("…including when it disagrees with the property record",
  line("hookups", { included: "Yes", connections: null })?.text === "Washer & Dryer Hookups")
ok("…and it is marked confirmed, so the card can say where it came from",
  line("included", null)?.confirmed === true)

// ── THE CATALOG FILLS IN, IN ITS OWN WORDS ─────────────────────────────────────────────────
ok("an unqualified Yes reads as Included",
  line(null, { included: "Yes", connections: null })?.text === "Washer & Dryer Included")
ok("connections read as Connections, not as Included",
  line(null, { included: null, connections: "Yes" })?.text === "Washer & Dryer Connections")
ok("Select Units is NOT flattened into Included",
  line(null, { included: "Select Units", connections: null })?.text === "Washer & Dryer — Select Units")
ok("…nor is Specific Floor Plans",
  line(null, { included: "Specific Floor Plans", connections: null })?.text
    === "Washer & Dryer — Specific Floor Plans")
ok("qualified connections keep their qualifier too",
  line(null, { included: null, connections: "Select Units" })?.text
    === "Washer & Dryer Connections — Select Units")
ok("the catalog line is never marked confirmed",
  line(null, { included: "Yes", connections: null })?.confirmed === false)
ok("Included outranks Connections when a property records both",
  line(null, { included: "Yes", connections: "Yes" })?.text === "Washer & Dryer Included")

// ── SILENCE, WHERE SILENCE IS THE TRUTH ────────────────────────────────────────────────────
ok("nothing recorded anywhere renders no line", line(null, null) === null)
ok("…and an empty record is the same as none", line(null, { included: null, connections: null }) === null)
ok('a catalog "No" renders nothing — the line is a detail, not a verdict',
  line(null, { included: "No", connections: null }) === null)
ok('…including "No" on both columns', line(null, { included: "No", connections: "No" }) === null)
ok("a token outside the recorded vocabulary is not echoed onto the card",
  line(null, { included: "probably" as string, connections: null }) === null)

// ── ABACUS ALAMO RANCH — THE EXAMPLE THIS WAS ASKED TO FIX ─────────────────────────────────
// property_catalog place ChIJq42a1ZhDXIYRtrTF7gbdX7c: washer_dryer_included "Yes",
// washer_dryer_connections null. The client this was reported on has no lead_property_reasons
// row at all, so there is no confirmation to outrank it.
const abacus = line(null, { included: "Yes", connections: null })
ok("Abacus now shows a line", abacus !== null)
ok("…reading exactly 'Washer & Dryer Included'", abacus?.text === "Washer & Dryer Included")
ok("…and marked unconfirmed, because nobody has confirmed it for this client",
  abacus?.confirmed === false)

// ── THE READ PATH ──────────────────────────────────────────────────────────────────────────
const cat = read("lib/propertyIntel/washerDryerCatalog.ts")
const dash = read("components/crm/DashboardClient.tsx")
const card = read("components/crm/BestMatches.tsx")
const sql = read("supabase/prepared/20261115000000_washer_dryer_by_ids.sql")

// Comments stripped: the shared function is NAMED in a comment explaining why it is left
// alone, and what must be absent is a CALL to it.
const catCode = cat.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
ok("the lookup is its own function, not a widening of the shared one",
  /rpc\("lb_property_washer_dryer_by_ids"/.test(catCode) && !/lb_property_catalog_by_ids/.test(catCode))
ok("…and the migration never touches the shared function",
  !/lb_property_catalog_by_ids/.test(sql.replace(/^--.*$/gm, "")))
ok("it is batched, never one request per property",
  /for \(let i = 0; i < ids\.length; i \+= CATALOG_WD_BATCH\)/.test(cat))
ok("…at the same 60-id cap the existing lookup uses",
  /const CATALOG_WD_BATCH = 60/.test(cat) && /v_n > 60/.test(sql))
ok("a failed or missing lookup degrades to nothing, never throws",
  /if \(error \|\| !data\) continue/.test(cat))
ok("the effect re-runs when the set of properties changes, so a Quick Match run is covered",
  /\}, \[recommendedPlaceIds\.join\(","\)\]\)/.test(dash))
ok("…keyed the way the card looks them up",
  /\[`pid:\$\{pid\}`, v\]/.test(dash))

// ── PERMISSIONS ────────────────────────────────────────────────────────────────────────────
ok("the function is SECURITY DEFINER with a fixed search_path",
  /security definer/.test(sql) && /set search_path = public/.test(sql))
ok("granted to authenticated only", /grant execute on function public\.lb_property_washer_dryer_by_ids\(text\[\]\) to authenticated/.test(sql))
ok("…and revoked from public and anon",
  /revoke all on function public\.lb_property_washer_dryer_by_ids\(text\[\]\) from public, anon/.test(sql))
ok("it returns three columns and nothing more",
  (sql.match(/returns table \(([\s\S]*?)\)/)?.[1].match(/\w+\s+text/g) ?? []).length === 3)
ok("the migration writes nothing and alters no table",
  !/\binsert\b|\bupdate\b|\bdelete\b|alter table|create table|drop table|create policy|drop policy/i
    .test(sql.replace(/^--.*$/gm, "")))

// ── PLACEMENT, AND WHAT IT IS NOT ──────────────────────────────────────────────────────────
const rightColumn = card.slice(card.indexOf("{/* Name row"), card.indexOf("{/* QUICK MATCH DETAIL"))
ok("the line sits with the standard details, after the rating row",
  rightColumn.indexOf("Google Rating") < rightColumn.indexOf("{wdLine && ("))
ok("…and before the Quick Match detail", card.indexOf("{wdLine && (") < card.indexOf("<QuickMatchDetail"))
ok("it is NOT one of the three highlights",
  !/washerDryer|wdLine/.test(read("lib/leads/bedroomPricing.ts"))
    && !/wdLine/.test(card.slice(card.indexOf("<ReasonsControl"))))
ok("one line, one treatment — provenance is in the tooltip, not a second colour",
  (card.match(/\{wdLine\.text\}/g) ?? []).length === 1 && /title=\{wdLine\.confirmed/.test(card))
ok("the same resolution serves hand-picked and Quick Match rows alike",
  (card.match(/washerDryerCardLine\(/g) ?? []).length === 1)

// ── THE CLIENT-FACING SIDE IS UNTOUCHED ────────────────────────────────────────────────────
const client = read("app/locator-beast/r/[token]/RecommendationList.tsx")
ok("the renter's pill still renders only from a confirmed status",
  /washerDryerLabel\(p\.washerDryer\)/.test(client))
ok("…and knows nothing about the catalog lookup",
  !/washerDryerCardLine|lb_property_washer_dryer_by_ids|CatalogWasherDryer/.test(client))
ok("the confirmation editor is unchanged",
  /WASHER_DRYER_OPTIONS/.test(read("components/crm/ReasonsControl.tsx")))

void (async () => {
  // ── BATCHING, EXERCISED RATHER THAN GREPPED ────────────────────────────────────────────────
  // The function rejects an over-cap request instead of truncating it (verified live against the
  // existing lookup, which carries the identical cap: 60 accepted, 61 and 120 rejected 23514).
  // So the only thing standing between 140 properties and a hard error is this chunking.
  {
    const calls: string[][] = []
    const fake = {
      rpc: async (_name: string, args: { p_place_ids: string[] }) => {
        calls.push(args.p_place_ids)
        return { data: args.p_place_ids.map((id) => ({ place_id: id, washer_dryer_included: "Yes", washer_dryer_connections: null })), error: null }
      },
    } as unknown as Parameters<typeof loadCatalogWasherDryer>[0]

    const ids = Array.from({ length: 140 }, (_, i) => `place_${i}`)
    const map = await loadCatalogWasherDryer(fake, ids)
    ok("140 ids are split into chunks", calls.length === 3, `${calls.length} calls`)
    ok("…none of which exceeds the 60-id cap", calls.every((c) => c.length <= 60),
      calls.map((c) => c.length).join("+"))
    ok("…and every id is requested exactly once",
      calls.flat().length === 140 && new Set(calls.flat()).size === 140)
    ok("…with every row returned making it into the map", map.size === 140)

    const dupCalls = calls.length
    await loadCatalogWasherDryer(fake, ["a", "a", "a", "b"])
    ok("duplicates are deduped before the request is made",
      calls[dupCalls].length === 2, JSON.stringify(calls[dupCalls]))

    const empty = await loadCatalogWasherDryer(fake, [])
    ok("an empty set makes no request at all", empty.size === 0 && calls.length === dupCalls + 1)
  }
  {
    // The function does not exist yet in any database but this one's test double; the loader must
    // return an empty map rather than throw, so the card renders exactly as it does today.
    const missing = {
      rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }),
    } as unknown as Parameters<typeof loadCatalogWasherDryer>[0]
    const map = await loadCatalogWasherDryer(missing, ["x", "y"])
    ok("a missing function yields an empty map, not an exception", map.size === 0)
    ok("…and an empty map renders no line", washerDryerCardLine(null, map.get("x") ?? null) === null)
  }

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
  process.exit(fail > 0 ? 1 : 0)
})()
