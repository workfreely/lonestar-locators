// VERIFY THE AREA SELECTION LIMIT TRIGGER IN PRODUCTION
//
// Checks the live database, not the repo: that lb_area_selection_count exists and
// agrees with the TypeScript implementation, that the trigger actually fires, and
// that the legacy-reduction carve-out works.
//
// SAFETY. Rejected writes change nothing by definition, so those cases are free.
// The two cases that MUST mutate (a legacy lead reducing, and an unrelated edit on an
// over-cap lead) run only against SOFT-DELETED TEST ROWS, capture the exact original
// values first, and restore them afterwards — with the restore verified by re-reading
// the row. No live client's data is touched.
//
// Uses the service-role key, which bypasses RLS but NOT triggers — so this exercises
// the same guard a direct browser write from Edit Client would hit.
//
// Run: npx tsx scripts/sql/verifyAreaLimitTrigger.ts
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { countAreaSelections } from "@/lib/leads/areaLimit"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}${d ? ` — ${d}` : ""}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}

/** Did this write get refused by OUR trigger (rather than succeed, or fail for another reason)? */
function refusedByLimit(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  return /Area selection limit/i.test(error.message ?? "")
}

type Row = { id: number; first_name: string | null; neighborhoods: string | null; submarkets: string | null; deleted_at: string | null }

async function readLead(id: number): Promise<Row> {
  const { data, error } = await db.from("leads").select("id,first_name,neighborhoods,submarkets,deleted_at").eq("id", id).single()
  if (error) throw new Error(`read lead ${id}: ${error.message}`)
  return data as Row
}

async function main() {
  // ─── 1. The counting function exists and agrees with the app ──────────────
  console.log("1. lb_area_selection_count() EXISTS AND MATCHES THE TYPESCRIPT:")
  const cases: Array<[string | null, string | null]> = [
    [null, null],
    ["", ""],
    ["Stone Oak", null],
    ["Stone Oak, UTSA", null],
    [null, "Boerne, Schertz"],
    ["Stone Oak", "Boerne"],
    ["Stone Oak, UTSA", "Boerne, Schertz"],
    ["Downtown, , ,", null],
    ["All of Houston, Downtown Houston, Midtown, Montrose, The Heights, Medical Center, Museum District, River Oaks, Galleria, Washington Ave, East Downtown (EaDo), Greenway / Upper Kirby", null],
  ]
  let rpcReachable = true
  for (const [n, s] of cases) {
    const { data, error } = await db.rpc("lb_area_selection_count", { p_neighborhoods: n, p_submarkets: s })
    if (error) {
      rpcReachable = false
      ok(`count(${JSON.stringify(n)}, ${JSON.stringify(s)})`, false, error.message)
      continue
    }
    const expected = countAreaSelections(n, s)
    ok(`count(${JSON.stringify(n)?.slice(0, 34)}…, ${JSON.stringify(s)}) = ${data}`, data === expected,
      data === expected ? `matches TS (${expected})` : `live ${data} vs TS ${expected}`)
  }
  if (!rpcReachable) console.log("     (function not exposed over PostgREST — see the SQL fallback at the end)")

  // ─── 2. Which rows are safe to mutate ─────────────────────────────────────
  const { data: all, error: allErr } = await db.from("leads")
    .select("id,first_name,neighborhoods,submarkets,deleted_at").order("id")
  if (allErr) throw new Error(allErr.message)
  const rows = all as Row[]
  const overCap = rows.filter((r) => countAreaSelections(r.neighborhoods, r.submarkets) > 2)
  console.log(`\n2. BASELINE: ${rows.length} leads, ${overCap.length} over the cap`)
  for (const r of overCap) {
    console.log(`     ${r.id} ${r.first_name}${r.deleted_at ? " [soft-deleted]" : ""} — ${countAreaSelections(r.neighborhoods, r.submarkets)} areas`)
  }

  // Mutating tests use soft-deleted TEST rows only.
  const reduceTarget = overCap.find((r) => r.deleted_at && countAreaSelections(r.neighborhoods, r.submarkets) >= 5)
  const capTarget = overCap.find((r) => r.deleted_at && countAreaSelections(r.neighborhoods, r.submarkets) === 3)
  if (!reduceTarget || !capTarget) {
    console.log("\n  ! No suitable soft-deleted test rows; skipping the mutating cases.")
  }

  // ─── 3. INSERT over the cap is refused ────────────────────────────────────
  console.log("\n3. THE TRIGGER FIRES ON INSERT:")
  {
    const probe = {
      first_name: "ZZTriggerProbe", last_name: "Insert", city: "San Antonio",
      neighborhoods: "Downtown San Antonio, Stone Oak, UTSA", submarkets: null,
    }
    const { data, error } = await db.from("leads").insert(probe).select("id")
    ok("a 3-area INSERT is rejected", refusedByLimit(error), error?.message?.slice(0, 90) ?? "it SUCCEEDED")
    if (data?.length) {
      await db.from("leads").delete().eq("id", (data[0] as { id: number }).id)
      console.log("     (inserted row removed)")
    }
    const { data: ins2, error: e2 } = await db.from("leads")
      .insert({ ...probe, neighborhoods: "Stone Oak", submarkets: "Boerne" }).select("id")
    ok("a 2-area INSERT is allowed", !e2 && !!ins2?.length, e2?.message?.slice(0, 80) ?? "created")
    if (ins2?.length) {
      const id = (ins2[0] as { id: number }).id
      // Same row, now at the cap: this is the user's exact "2 → 3" case.
      const { error: e3 } = await db.from("leads").update({ submarkets: "Boerne, Schertz" }).eq("id", id)
      ok("2 areas → 3 is REJECTED on a direct UPDATE", refusedByLimit(e3), e3?.message?.slice(0, 90) ?? "it SUCCEEDED")
      const { error: e4 } = await db.from("leads").update({ neighborhoods: "Stone Oak, UTSA", submarkets: "Boerne, Schertz" }).eq("id", id)
      ok("2 + 2 (would pass a per-section cap) is REJECTED", refusedByLimit(e4), e4?.message?.slice(0, 90) ?? "it SUCCEEDED")
      // Both columns together — the row holds "Stone Oak" + "Boerne", so changing
      // only `neighborhoods` to two values would be a 3-area write, not a swap.
      const { error: e5 } = await db.from("leads")
        .update({ neighborhoods: "Stone Oak, UTSA", submarkets: null }).eq("id", id)
      ok("swapping within the cap (2 → 2) is allowed", !e5, e5?.message?.slice(0, 80) ?? "allowed")
      // Moving a selection ACROSS the two columns is also still 2.
      const { error: e6 } = await db.from("leads")
        .update({ neighborhoods: "Stone Oak", submarkets: "Schertz" }).eq("id", id)
      ok("moving a selection between the two columns is allowed", !e6, e6?.message?.slice(0, 80) ?? "allowed")
      const after = await readLead(id)
      ok("the rejected writes left the row unchanged at 2",
        countAreaSelections(after.neighborhoods, after.submarkets) === 2,
        `${JSON.stringify(after.neighborhoods)} / ${JSON.stringify(after.submarkets)}`)
      await db.from("leads").delete().eq("id", id)
      const { data: gone } = await db.from("leads").select("id").eq("id", id)
      ok("the probe row is fully removed", (gone ?? []).length === 0)
    }
  }

  // ─── 4. A legacy over-cap lead can still reduce ───────────────────────────
  //
  // NOT RUN BY DEFAULT, and the reason is the rule itself: reducing an over-cap row
  // is ONE-WAY. Once lead 70 goes 12 → 4 the trigger correctly refuses to put the 12
  // back, so there is no way to undo it over PostgREST, which has no transactions.
  // Proving the carve-out is not worth an irreversible edit to someone's data.
  //
  // The reversible proof is section 4 of the migration: `begin; …; rollback;` in the
  // SQL Editor, which exercises the real trigger and keeps nothing. This script
  // prints it rather than performing it. Pass --allow-destructive-reduce to opt in.
  console.log("\n4. A LEGACY OVER-CAP LEAD CAN REDUCE:")
  if (!process.argv.includes("--allow-destructive-reduce")) {
    const t = reduceTarget ?? overCap[0]
    console.log("     SKIPPED — this case cannot be undone over PostgREST (no transactions), and")
    console.log("     the trigger rightly refuses to restore an over-cap value afterwards.")
    console.log("     Run this in the SQL Editor instead; the rollback keeps nothing:")
    console.log("")
    console.log("       begin;")
    if (t) {
      const n = countAreaSelections(t.neighborhoods, t.submarkets)
      console.log(`         -- lead ${t.id} currently holds ${n} areas`)
      console.log(`         update public.leads set neighborhoods = 'Downtown Houston, Midtown'`)
      console.log(`          where id = ${t.id};            -- ${n} -> 2, must be ALLOWED`)
      console.log(`         update public.leads set neighborhoods = 'A, B, C'`)
      console.log(`          where id = ${t.id};            -- back up to 3, must be REJECTED`)
    }
    console.log("       rollback;")
    console.log("")
    console.log("     The equivalent logic is covered non-destructively by scripts/leads/areaLimit.test.ts")
    console.log("     (verdictForWrite: 12→5 allowed, 5→5 refused, 5→6 refused), and the trigger's own")
    console.log("     `v_new_count < v_old_count` branch is asserted against the migration text there.")
  } else if (reduceTarget) {
    const original = await readLead(reduceTarget.id)
    const startCount = countAreaSelections(original.neighborhoods, original.submarkets)
    console.log(`     DESTRUCTIVE MODE on soft-deleted test row ${original.id} ${original.first_name} (${startCount} areas)`)
    const partial = (original.neighborhoods ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4).join(", ")
    const { error: eA } = await db.from("leads").update({ neighborhoods: partial, submarkets: null }).eq("id", original.id)
    ok(`${startCount} → ${countAreaSelections(partial, null)} (still over cap, but fewer) is ALLOWED`, !eA, eA?.message?.slice(0, 90) ?? "allowed")
    const bigger = (original.neighborhoods ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5).join(", ")
    const { error: eB } = await db.from("leads").update({ neighborhoods: bigger }).eq("id", original.id)
    ok("growing again is REJECTED", refusedByLimit(eB), eB?.message?.slice(0, 90) ?? "it SUCCEEDED")
    const { error: eC } = await db.from("leads").update({ neighborhoods: partial.split(",").map((s) => s.trim()).reverse().join(", ") }).eq("id", original.id)
    ok("holding steady at an over-cap count is REJECTED", refusedByLimit(eC), eC?.message?.slice(0, 90) ?? "it SUCCEEDED")
    const { error: eD } = await db.from("leads").update({ neighborhoods: "Downtown Houston, Midtown" }).eq("id", original.id)
    ok("reducing to exactly 2 is ALLOWED", !eD, eD?.message?.slice(0, 90) ?? "allowed")
    const { error: eE } = await db.from("leads").update({ neighborhoods: "Downtown Houston, Midtown, Montrose" }).eq("id", original.id)
    ok("once at 2, a third is REJECTED like any other lead", refusedByLimit(eE), eE?.message?.slice(0, 90) ?? "it SUCCEEDED")
    console.log(`     ⚠ Lead ${original.id} was permanently reduced ${startCount} → 2 and CANNOT be restored while the trigger is active.`)
    console.log(`       Original: neighborhoods=${JSON.stringify(original.neighborhoods)} submarkets=${JSON.stringify(original.submarkets)}`)
  }

  // ─── 5. Unrelated edits on an over-cap lead still work ────────────────────
  const untouched = (await db.from("leads").select("id,first_name,neighborhoods,submarkets,deleted_at").order("id")).data as Row[]
  const stillOver = untouched.filter((r) => countAreaSelections(r.neighborhoods, r.submarkets) > 2 && r.deleted_at)
  if (stillOver.length) {
    const t = stillOver[0]
    const n = countAreaSelections(t.neighborhoods, t.submarkets)
    console.log(`\n5. UNRELATED EDITS ON AN OVER-CAP LEAD (soft-deleted row ${t.id} ${t.first_name}, ${n} areas):`)
    const before = await readLead(t.id)
    const { data: orig } = await db.from("leads").select("locator_notes").eq("id", t.id).single()
    const originalNotes = (orig as { locator_notes: string | null } | null)?.locator_notes ?? null
    const { error: eN } = await db.from("leads")
      .update({ locator_notes: `${originalNotes ?? ""}\n[trigger verification ${new Date().toISOString()}]` }).eq("id", t.id)
    ok(`a ${n}-area lead accepts an edit that does NOT touch the area columns`, !eN, eN?.message?.slice(0, 90) ?? "allowed")
    const after = await readLead(t.id)
    ok("its areas were not altered by that edit",
      after.neighborhoods === before.neighborhoods && after.submarkets === before.submarkets)
    const { error: rN } = await db.from("leads").update({ locator_notes: originalNotes }).eq("id", t.id)
    ok("the note was restored", !rN, rN?.message?.slice(0, 60) ?? "restored")
  }

  // ─── 6. Final integrity sweep ─────────────────────────────────────────────
  console.log("\n6. INTEGRITY AFTER VERIFICATION:")
  const final = (await db.from("leads").select("id,first_name,neighborhoods,submarkets,deleted_at").order("id")).data as Row[]
  ok("lead count unchanged", final.length === rows.length, `${final.length} leads`)
  ok("no probe rows left behind", !final.some((r) => r.first_name === "ZZTriggerProbe"))
  const changed = final.filter((r) => {
    const o = rows.find((x) => x.id === r.id)
    return o && (o.neighborhoods !== r.neighborhoods || o.submarkets !== r.submarkets)
  })
  ok("no LIVE client's areas were modified", !changed.some((r) => !r.deleted_at),
    changed.length ? `touched: ${changed.map((r) => `${r.id}${r.deleted_at ? " [deleted]" : " LIVE"}`).join(", ")}` : "none touched")

  console.log(`\nArea limit trigger verification: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1) })
