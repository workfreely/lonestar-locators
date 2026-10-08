// AUTOPILOT WRITE PATH — claims, concurrency, rejections, and dry-run/persist parity.
//
// The executor is injected, so these tests drive the real buildClaims/applyAutopilotPlan logic
// against an in-memory model of Postgres that reproduces the two protections the migration adds:
// a conditional UPDATE (matches zero rows when the row changed) and a UNIQUE index on
// (connection_id, scheduled_at). The DB's own behaviour is proved separately against a real
// Postgres; these tests prove that THIS module reacts to it correctly.
//
// Run: npx tsx scripts/social/autopilotWrite.test.ts
import {
  applyAutopilotPlan, buildClaims, DEFAULT_WRITE_MODE, CLAIM_REQUIRED_NULLS,
  type ClaimExecutor, type ClaimRequest, type Claim,
} from "@/lib/social/autopilotWrite"
import type { EligibilityInput } from "@/lib/social/autopilotEligibility"
import type { PlannedPost } from "@/lib/social/autopilotPlanner"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const CONN_A = "conn-aaaa", CONN_B = "conn-bbbb"
const T1 = "2026-10-09T12:30:00.000Z", T2 = "2026-10-09T19:30:00.000Z"

const eligible = (over: Partial<EligibilityInput> = {}): EligibilityInput => ({
  status: "ready", renderStatus: "ready", renderedStoragePath: "renders/x.mp4",
  scheduledAt: null, publishedAt: null, externalPostId: null, connectionId: null,
  platform: "instagram", ...over,
})
const planned = (postId: string, connectionId: string, at: string, i = 0): PlannedPost => ({
  postId, sourceContentId: `src-${postId}`, connectionId, dateKey: at.slice(0, 10),
  minute: 750, scheduledAtUtc: at, market: "San Antonio", propertyName: `P-${postId}`, poolIndex: i,
})
const planOf = (planned: PlannedPost[], over: Partial<{ sufficient: boolean; poolSize: number; requiredPoolSize: number; unfilledSlots: number }> = {}) => ({
  planned, sufficient: true, poolSize: planned.length, requiredPoolSize: planned.length, unfilledSlots: 0, ...over,
})
const stateMap = (ids: string[], over: Partial<EligibilityInput> = {}) =>
  new Map(ids.map((id) => [id, eligible(over)]))

// ── An in-memory Postgres that honours the two guards the migration installs ────────────────────
type Row = EligibilityInput & { id: string }
function makeDb(rows: Row[]) {
  const byId = new Map(rows.map((r) => [r.id, { ...r }]))
  const slots = new Set<string>()   // the UNIQUE (connection_id, scheduled_at) index
  const log: ClaimRequest[] = []
  const exec: ClaimExecutor = async (req) => {
    log.push(req)
    const r = byId.get(req.postId)
    if (!r) return { ok: false, reason: "no_match" }
    // The conditional UPDATE's WHERE clause, exactly as the real one is built.
    const matches = r.status === req.requireStatus
      && r.renderStatus === req.requireRenderStatus
      && !!r.renderedStoragePath
      && req.requireNullColumns.every((c) => ({
        scheduled_at: r.scheduledAt, connection_id: r.connectionId,
        published_at: r.publishedAt, external_post_id: r.externalPostId,
      })[c] === null)
    if (!matches) return { ok: false, reason: "no_match" }
    const slot = `${req.connectionId}@${req.scheduledAtUtc}`
    if (slots.has(slot)) return { ok: false, reason: "slot_taken" }   // 23505
    slots.add(slot)
    r.status = "scheduled"; r.scheduledAt = req.scheduledAtUtc; r.connectionId = req.connectionId
    return { ok: true }
  }
  return { exec, byId, slots, log }
}

async function main() {
  console.log("defaults — dry run unless told otherwise:")
  ok("the module's default mode is dry_run", DEFAULT_WRITE_MODE === "dry_run")
  {
    const p = planOf([planned("p1", CONN_A, T1)])
    const db = makeDb([{ id: "p1", ...eligible() }])
    const r = await applyAutopilotPlan({ plan: p, current: stateMap(["p1"]), executor: db.exec })
    ok("omitting mode does NOT write", r.mode === "dry_run" && db.log.length === 0)
    ok("and claims nothing", r.claimed.length === 0)
    ok("but it still reports what it WOULD claim", r.claims.length === 1 && r.claims[0].postId === "p1")
  }
  {
    // The dangerous failure is believing you persisted when you did not. It must be loud.
    let threw = ""
    try {
      await applyAutopilotPlan({ plan: planOf([planned("p1", CONN_A, T1)]), current: stateMap(["p1"]), mode: "persist" })
    } catch (e) { threw = (e as Error).message }
    ok("persist WITHOUT an executor throws rather than silently dry-running", /requires an executor/.test(threw))
  }

  console.log("\nthe write path claims eligible posts:")
  {
    const ids = ["p1", "p2", "p3"]
    const p = planOf([planned("p1", CONN_A, T1), planned("p2", CONN_A, T2), planned("p3", CONN_B, T1)])
    const db = makeDb(ids.map((id) => ({ id, ...eligible() })))
    const r = await applyAutopilotPlan({ plan: p, current: stateMap(ids), mode: "persist", executor: db.exec })
    ok("all three are claimed", r.claimed.length === 3 && r.rejected.length === 0)
    ok("complete is true only when nothing was rejected", r.complete)
    ok("every claim persists connection_id AND scheduled_at together",
      [...db.byId.values()].every((x) => !!x.connectionId && !!x.scheduledAt && x.status === "scheduled"))
    ok("two DIFFERENT connections may share the same minute — the key is (connection, minute)",
      db.byId.get("p1")!.scheduledAt === db.byId.get("p3")!.scheduledAt
      && db.byId.get("p1")!.connectionId !== db.byId.get("p3")!.connectionId)
    ok("the claim re-asserts every eligibility column server-side",
      db.log.every((q) => q.requireStatus === "ready" && q.requireRenderStatus === "ready"
        && q.requireRenderedArtifact === true
        && CLAIM_REQUIRED_NULLS.every((c) => q.requireNullColumns.includes(c))))
    ok("writes are issued in deterministic time order", db.log[0].scheduledAtUtc <= db.log[1].scheduledAtUtc)
  }

  console.log("\nunrendered / ineligible posts are REJECTED, never scheduled:")
  {
    const cases: [string, Partial<EligibilityInput>, string][] = [
      ["render_status not ready (never rendered)", { renderStatus: "none" }, "no_rendered_artifact"],
      ["render_status ready but NO artifact path", { renderedStoragePath: null }, "no_rendered_artifact"],
      ["render failed", { renderStatus: "error" }, "render_failed"],
      ["status draft", { status: "draft" }, "not_ready"],
      ["status needs_attention", { status: "needs_attention" }, "needs_attention"],
      ["already scheduled", { scheduledAt: T2 }, "already_scheduled"],
      ["already published", { status: "published" }, "already_published"],
      ["has published_at", { publishedAt: T1 }, "already_published"],
      ["has external_post_id", { externalPostId: "ig_123" }, "already_published"],
      ["already assigned to a connection", { connectionId: CONN_B }, "assigned_to_connection"],
      ["wrong platform", { platform: "tiktok" }, "wrong_platform"],
    ]
    for (const [label, over, reason] of cases) {
      const db = makeDb([{ id: "p1", ...eligible(over) }])
      const r = await applyAutopilotPlan({
        plan: planOf([planned("p1", CONN_A, T1)]), current: new Map([["p1", eligible(over)]]),
        mode: "persist", executor: db.exec,
      })
      const rej = r.rejected[0]
      ok(`${label} → rejected as "${reason}", nothing written`,
        r.claimed.length === 0 && db.log.length === 0
        && rej?.kind === "ineligible" && rej.reason === reason)
    }
  }
  {
    // The in-memory predicate could in principle be bypassed; the SQL WHERE must still refuse.
    const db = makeDb([{ id: "p1", ...eligible({ renderStatus: "none" }) }])
    const r = await applyAutopilotPlan({
      plan: planOf([planned("p1", CONN_A, T1)]),
      current: stateMap(["p1"]),           // stale: claims it IS eligible
      mode: "persist", executor: db.exec,
    })
    ok("a STALE plan still cannot schedule an unrendered post — the SQL re-check refuses it",
      r.claimed.length === 0 && r.rejected[0]?.kind === "post_lost" && db.log.length === 1)
    ok("and the row is untouched", db.byId.get("p1")!.scheduledAt === null)
  }

  console.log("\nconcurrency — two writers, one post / one slot:")
  {
    // Shared database, two independent runs issuing the SAME plan at the same time.
    const db = makeDb([{ id: "p1", ...eligible() }])
    const p = planOf([planned("p1", CONN_A, T1)])
    const [a, b] = await Promise.all([
      applyAutopilotPlan({ plan: p, current: stateMap(["p1"]), mode: "persist", executor: db.exec }),
      applyAutopilotPlan({ plan: p, current: stateMap(["p1"]), mode: "persist", executor: db.exec }),
    ])
    const won = [a, b].filter((r) => r.claimed.length === 1).length
    const lost = [a, b].filter((r) => r.rejected.some((x) => x.kind === "post_lost" || x.kind === "slot_taken")).length
    ok("exactly ONE writer claims the post", won === 1)
    ok("the other is told it lost, not silently ignored", lost === 1)
    ok("the row is scheduled exactly once", db.byId.get("p1")!.status === "scheduled" && db.slots.size === 1)
    ok("the loser reports complete === false", [a, b].some((r) => !r.complete))
  }
  {
    // Two DIFFERENT posts racing for one destination slot — the unique index decides.
    const db = makeDb([{ id: "p1", ...eligible() }, { id: "p2", ...eligible() }])
    const [a, b] = await Promise.all([
      applyAutopilotPlan({ plan: planOf([planned("p1", CONN_A, T1)]), current: stateMap(["p1"]), mode: "persist", executor: db.exec }),
      applyAutopilotPlan({ plan: planOf([planned("p2", CONN_A, T1)]), current: stateMap(["p2"]), mode: "persist", executor: db.exec }),
    ])
    ok("only one post takes the destination slot", db.slots.size === 1)
    ok("exactly one claim succeeded", [a, b].filter((r) => r.claimed.length === 1).length === 1)
    ok("the loser is reported as slot_taken", [a, b].some((r) => r.rejected.some((x) => x.kind === "slot_taken")))
  }
  {
    // A planner bug that double-books one slot is caught BEFORE the database sees it.
    const db = makeDb([{ id: "p1", ...eligible() }, { id: "p2", ...eligible() }])
    const r = await applyAutopilotPlan({
      plan: planOf([planned("p1", CONN_A, T1), planned("p2", CONN_A, T1)]),
      current: stateMap(["p1", "p2"]), mode: "persist", executor: db.exec,
    })
    ok("a plan double-booking one slot claims only one", r.claimed.length === 1)
    ok("and names the duplicate instead of surfacing an opaque DB error",
      r.preRejected.some((x) => x.kind === "slot_taken"))
  }

  console.log("\ndry run vs persisted plan — parity:")
  {
    const ids = ["p1", "p2", "p3", "p4"]
    const plan = planOf([
      planned("p4", CONN_B, T2, 3), planned("p1", CONN_A, T1, 0),
      planned("p3", CONN_A, T2, 2), planned("p2", CONN_B, T1, 1),
    ])
    const cur = stateMap(ids)
    const dry = await applyAutopilotPlan({ plan, current: cur })
    const db = makeDb(ids.map((id) => ({ id, ...eligible() })))
    const wet = await applyAutopilotPlan({ plan, current: cur, mode: "persist", executor: db.exec })
    const key = (c: Claim) => `${c.postId}|${c.connectionId}|${c.scheduledAtUtc}`
    ok("the dry run's claims are IDENTICAL to what persist actually claimed",
      JSON.stringify(dry.claims.map(key)) === JSON.stringify(wet.claimed.map(key)))
    ok("same order, too — not just the same set", dry.claims.map(key).join() === wet.claimed.map(key).join())
    ok("the dry run wrote nothing while reporting the same work", dry.claimed.length === 0 && wet.claimed.length === 4)
    ok("inventory reporting is identical in both modes",
      JSON.stringify(dry.inventory) === JSON.stringify(wet.inventory))
    ok("claims are deterministic across repeated builds",
      JSON.stringify(buildClaims(plan, cur).claims) === JSON.stringify(buildClaims(plan, cur).claims))
  }

  console.log("\ninsufficient inventory is reported loudly, not inferred:")
  {
    const r = await applyAutopilotPlan({
      plan: planOf([planned("p1", CONN_A, T1)], { sufficient: false, poolSize: 7, requiredPoolSize: 28, unfilledSlots: 21 }),
      current: stateMap(["p1"]),
    })
    ok("sufficient is false", !r.inventory.sufficient)
    ok("the summary states the shortfall in words", /INSUFFICIENT INVENTORY/.test(r.inventory.summary))
    ok("it names both numbers and the unfilled count",
      /7 eligible/.test(r.inventory.summary) && /28 slot/.test(r.inventory.summary) && /21 slot/.test(r.inventory.summary))
    ok("it says what to do about it", /Render more inventory/.test(r.inventory.summary))
    ok("a short pool still claims what it legitimately can", r.claims.length === 1)
  }

  console.log(`\nAutopilot write path: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}
main()
