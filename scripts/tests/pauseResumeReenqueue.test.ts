/**
 * PAUSE / RESUME RE-ENQUEUE — Automated Texts Off → On must not strand a run.
 *
 * THE DEFECT THIS LOCKS DOWN. `followup_outbound_intents.idempotency_key` is
 * declared `text unique` — UNCONDITIONALLY unique across the whole table, not
 * partial. `supersedeIntent()` set only `dispatch_status` + `error` and left that
 * key populated. So:
 *
 *   1. an enrolled lead's step enqueues  → intent pending, key "<run>:<step>"
 *   2. the locator turns Automated Texts OFF
 *   3. claim-time revalidation supersedes the pending intent (correct)
 *   4. the locator turns Automated Texts back ON
 *   5. the dispatcher re-evaluates and tries to enqueue the SAME step → the
 *      superseded row still owns "<run>:<step>", so the insert is rejected
 *   6. `enqueueIntent` nonetheless set the run to status='due'
 *   7. `dueWaitingRuns` only selects status='waiting', so nothing ever
 *      re-evaluates that run again, and `pendingIntents` finds no intent for it
 *
 * The run is then permanently stalled while still holding the
 * lead_followup_runs_one_active_lifecycle slot, which `enrollLifecycleRuns` only
 * frees when the applicable sequence CHANGES. Automated Texts Off became a
 * one-way door for that step.
 *
 * The partial index `followup_intents_active_step_uidx` on (run_id, step_key)
 * WHERE dispatch_status IN ('pending','claimed','sent') was already written to
 * allow exactly this re-enqueue — it excludes 'superseded'. The unconditional
 * global key defeated it. And the ack-FAILURE path already proves the intended
 * contract: it explicitly nulls `idempotency_key` so a retry can re-enqueue.
 *
 * Runs the REAL engine (tick / runClaim) against the in-memory store, which
 * mirrors BOTH database uniqueness guards faithfully.
 *
 * Run: npx tsx scripts/tests/pauseResumeReenqueue.test.ts
 */
import { readFileSync } from "node:fs"
import { HOLD_BACKOFF_MS, runClaim, tick } from "../../lib/followup/engine"
import { InMemoryFollowupStore, type SeedLead } from "../../lib/followup/sim/inMemoryStore"
import type { IntentInsert } from "../../lib/followup/store"

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`)
  }
}

const WS = "ws-pause-resume"
const DEVICE = "device-mac-1"
/** 10:10 America/Chicago — inside allowed hours, so quiet-hours never masks a result. */
const T0 = new Date("2026-10-01T15:10:00.000Z")
const ACTIVE = ["pending", "claimed", "sent"]

function seedLead(over: Partial<SeedLead> = {}): SeedLead {
  return {
    id: 1,
    first_name: "Dana",
    phone: "+12105550100",
    beds: "2",
    property_type: "apartment",
    move_date: "2026-11-01",
    crm_status: "new",
    sms_opt_in: true,
    held_at: null,
    followup_opt_in: true,
    followup_enrolled_at: T0.toISOString(),
    applied_at: null,
    // t1 is eligible at created_at + 5 min, so the run is due at T0.
    created_at: "2026-10-01T15:00:00.000Z",
    owner_user_id: "owner-1",
    workspace_id: WS,
    agentFirstName: "Jay",
    timeZone: "America/Chicago",
    accountAuthorized: true,
    ...over,
  }
}

function harness() {
  let now = new Date(T0)
  const store = new InMemoryFollowupStore(() => now)
  store.putLead(seedLead())
  return {
    store,
    get now() {
      return now
    },
    advance(ms: number) {
      now = new Date(now.getTime() + ms)
    },
    setAt(d: Date) {
      now = new Date(d)
    },
    intents: () => store.intentsForLead(1),
    active: () => store.intentsForLead(1).filter((i) => ACTIVE.includes(i.dispatch_status)),
    run: () => store.runForLead(1),
  }
}

async function main() {
  console.log("\nPAUSE / RESUME RE-ENQUEUE\n")

  // ─────────────────────────────────────────────────────────────────────────────
  // The eight-step lifecycle, in order, against the real engine.
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("The eight-step Off → On lifecycle")
  {
    const h = harness()

    // 1) An enrolled run enqueues its step.
    const t1 = await tick(h.store, h.now)
    const run = h.run()
    check("1. enrolled run enqueues its step", t1.enrolled === 1 && t1.enqueued === 1, JSON.stringify(t1))
    check("   …the run is new_lead/t1", run?.sequence_key === "new_lead" && run?.step_key === "t1", JSON.stringify(run))
    check("   …one pending intent exists", h.active().length === 1 && h.active()[0].dispatch_status === "pending")
    const firstKey = h.active()[0]?.idempotency_key
    check("   …keyed <run>:<step>", firstKey === `${run?.id}:t1`, String(firstKey))
    check("   …and the run is marked due", run?.status === "due", String(run?.status))

    // 2) Automated Texts turned OFF before the Mac claims.
    h.store.patchLead(1, { followup_opt_in: false })

    // 3) Claim-time revalidation supersedes the pending intent.
    const jobs = await runClaim(h.store, h.now, DEVICE, WS)
    const superseded = h.intents()[0]
    check("2+3. nothing is handed to the device while Off", jobs.length === 0, JSON.stringify(jobs))
    check("   …the pending intent is superseded", superseded?.dispatch_status === "superseded", String(superseded?.dispatch_status))
    check("   …with the gate's reason recorded", superseded?.error === "not_enrolled", String(superseded?.error))
    check(
      "   …its idempotency_key is RELEASED (the defect)",
      superseded?.idempotency_key === null,
      `key is still ${JSON.stringify(superseded?.idempotency_key)} — the re-enqueue below cannot succeed`,
    )
    check("   …the row is PRESERVED as evidence, not deleted", h.intents().length === 1)
    check(
      "   …retaining what was almost sent",
      !!superseded?.rendered_body && superseded.step_key === "t1" && superseded.sequence_key === "new_lead",
      JSON.stringify({ body: superseded?.rendered_body?.slice(0, 30), step: superseded?.step_key }),
    )
    check("   …and the run is re-evaluable, not canceled", h.run()?.status === "waiting", String(h.run()?.status))
    check("   …no active intent remains", h.active().length === 0)

    // 4) Automated Texts turned back ON.
    h.store.patchLead(1, { followup_opt_in: true })

    // 5) The same step re-enqueues once its backoff elapses.
    h.advance(HOLD_BACKOFF_MS + 60_000)
    const t2 = await tick(h.store, h.now)
    check("4+5. the same step re-enqueues after resume", t2.enqueued === 1, JSON.stringify(t2))
    check("   …no second run was created", h.store.runs.size === 1, `${h.store.runs.size} runs`)
    check("   …it is the SAME run, same step", h.run()?.id === run?.id && h.run()?.step_key === "t1")

    // 6) Exactly one active intent.
    check("6. exactly one ACTIVE intent exists", h.active().length === 1, JSON.stringify(h.intents().map((i) => i.dispatch_status)))
    check("   …and the superseded original is still on file", h.intents().length === 2)
    check(
      "   …never two active for one (run, step)",
      h.active().filter((i) => i.run_id === run?.id && i.step_key === "t1").length === 1,
    )

    // 7) The run is not stranded.
    const resumed = h.run()
    check("7. the run is not stranded", resumed?.status === "due" && h.active().length === 1, JSON.stringify({ status: resumed?.status, active: h.active().length }))
    check(
      "   …'due' is only ever claimed alongside a live intent",
      !(resumed?.status === "due" && h.active().length === 0),
    )

    // 8) A second tick changes nothing.
    const before = h.intents().length
    const t3 = await tick(h.store, h.now)
    check("8. a second tick is idempotent", t3.enqueued === 0 && h.intents().length === before, JSON.stringify(t3))
    check("   …still exactly one active intent", h.active().length === 1)
    check("   …the run is unchanged", h.run()?.status === "due" && h.run()?.step_key === "t1")
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // The run-status transition on a FAILED enqueue, which is the other half of the
  // stall. These two cases are indistinguishable from insertIntent's return value
  // alone — "duplicate" is returned both when a live intent already exists (where
  // due is the truth) and when the insert genuinely failed (where due strands it).
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\nenqueueIntent never marks a run due without a live intent")
  {
    /** Rejects every insert, so no active intent is ever created. */
    class RejectingStore extends InMemoryFollowupStore {
      async insertIntent(_intent: IntentInsert): Promise<"ok" | "duplicate"> {
        return "duplicate"
      }
    }
    let now = new Date(T0)
    const store = new RejectingStore(() => now)
    store.putLead(seedLead())

    const s = await tick(store, now)
    const run = store.runForLead(1)
    check("a rejected enqueue reports nothing enqueued", s.enqueued === 0, JSON.stringify(s))
    check("…no intent exists", store.intentsForLead(1).length === 0)
    check(
      "…the run is NOT marked due (that is the stall)",
      run?.status !== "due",
      `status=${run?.status} with 0 active intents — dueWaitingRuns would never see it again`,
    )
    check("…it stays waiting, so a later tick re-evaluates it", run?.status === "waiting", String(run?.status))
    check(
      "…backed off rather than retried every minute",
      !!run?.next_eligible_at && new Date(run.next_eligible_at).getTime() > now.getTime(),
      String(run?.next_eligible_at),
    )

    // And it genuinely recovers once the insert can succeed again.
    const recovered = new InMemoryFollowupStore(() => now)
    recovered.putLead(seedLead())
    await tick(recovered, now)
    check(
      "…while a SUCCESSFUL enqueue does mark the run due",
      recovered.runForLead(1)?.status === "due",
      String(recovered.runForLead(1)?.status),
    )
  }

  console.log("\na genuine duplicate tick (live intent already out) still reports due")
  {
    const h = harness()
    await tick(h.store, h.now)
    const run = h.run()
    check("first tick enqueued and marked due", run?.status === "due" && h.active().length === 1)
    // Force the run back to waiting WITHOUT withdrawing its live intent — the
    // duplicate-cron shape. The re-enqueue must be rejected by the active-step
    // index and the run must be restored to due, NOT left spinning.
    await h.store.updateRun(run!.id, { status: "waiting" })
    const s = await tick(h.store, h.now)
    check("the duplicate enqueue is rejected", s.enqueued === 0, JSON.stringify(s))
    check("…no second intent was created", h.intents().length === 1)
    check("…the live intent is untouched", h.active().length === 1 && h.active()[0].dispatch_status === "pending")
    check("…and the run is due again, because an intent really is live", h.run()?.status === "due", String(h.run()?.status))
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SAFETY CONTRACT — the five guarantees this pass must not weaken.
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\nSafety contract (unchanged by this pass)")
  {
    const gate = readFileSync("lib/followup/gate.ts", "utf8")
    const engine = readFileSync("lib/followup/engine.ts", "utf8")
    const store = readFileSync("lib/followup/stores/supabaseStore.ts", "utf8")

    check("the gate still blocks an un-enrolled lead", /if \(!lead\.followupOptIn\) return \{ action: "hold", reason: "not_enrolled" \}/.test(gate))
    check("…and an unauthorized ACCOUNT (the kill switch)", /if \(!lead\.accountAuthorized\) return \{ action: "hold", reason: "not_authorized" \}/.test(gate))
    check("the hard SMS opt-out is still a CANCEL, stronger than Off's hold", /if \(!lead\.smsOptIn\) return \{ action: "cancel", reason: "opt_out" \}/.test(gate))
    check("On Hold is still its own search-state branch", /if \(lead\.heldAt\) return \{ action: "hold", reason: "on_hold" \}/.test(gate))
    check("claim-time revalidation still runs the full gate", /const decision = evaluateSend\(now, lead, conv, share, runSnapshotFromRow\(run\)\)/.test(engine))
    check(
      "…in BOTH the tick and the claim",
      (engine.match(/evaluateSend\(now, lead, conv, share, runSnapshotFromRow\(run\)\)/g) ?? []).length === 2,
    )
    check("every enrollment producer re-checks enrollment", (engine.match(/!lead\.followupOptIn\) continue/g) ?? []).length === 3)
    check("candidate queries still filter on enrollment", (store.match(/\.eq\("followup_opt_in", true\)/g) ?? []).length === 3)
    check(
      "the handoff window still reads MANUAL outbound only (manual texting is never blocked by Off)",
      /withinHandoffWindow\(now, conv\.lastManualOutboundAt\)/.test(gate),
    )
    check("mode='paused' was NOT activated — still only ever written as auto", (engine.match(/mode: "auto"/g) ?? []).length === 3)
    check("…and no producer writes any other mode", !/mode: "(paused|manual|stopped)"/.test(engine))

    // All seven sequence families reach the one gate.
    const seq = readFileSync("lib/followup/sequences.ts", "utf8")
    for (const k of ["new_lead", "list_sent", "done_selecting", "application_status", "post_tour", "resume_search", "future_move"]) {
      check(`${k} is registered and therefore gated`, seq.includes(`"${k}"`))
    }

    // The partial index must stay partial, and the global key must stay released.
    const mig = readFileSync("supabase/migrations/20260924000002_followup_dispatch.sql", "utf8")
    check(
      "the active-step uniqueness is still PARTIAL on pending/claimed/sent",
      /followup_intents_active_step_uidx[\s\S]*?\(run_id, step_key\)[\s\S]*?where dispatch_status in \('pending', 'claimed', 'sent'\)/.test(mig),
    )
    check("supersede releases the global key", /dispatch_status: "superseded"[\s\S]{0,160}idempotency_key: null/.test(engine))
  }

  // ───────────────────────────────────────────────────────────────────────────
  // The CRM control must stay MOUNTED. It existed, correct and complete, for
  // weeks while being imported by nothing — so "the component exists" is not the
  // assertion that matters; "something renders it" is.
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\nThe CRM Automated Texts control is mounted and correctly wired")
  {
    const dash = readFileSync("components/crm/DashboardClient.tsx", "utf8")
    const toggle = readFileSync("components/crm/AutomatedTextsToggle.tsx", "utf8")

    check("DashboardClient imports the existing control", /import AutomatedTextsToggle from "\.\/AutomatedTextsToggle"/.test(dash))
    check("…and actually renders it", /<AutomatedTextsToggle/.test(dash))
    check("…gated on account authorization", /\{automatedTextingAuthorized && \(\s*<AutomatedTextsToggle/.test(dash))
    check(
      "…keyed per lead, so one client's state is never shown for another",
      /<AutomatedTextsToggle[\s\S]{0,200}?key=\{`automated-texts-\$\{selectedLead\.id\}`\}/.test(dash),
    )
    check("…seeded from that lead's own enrollment", /initialEnrolled=\{\(selectedLead as any\)\.followup_opt_in === true\}/.test(dash))

    check('the label is still "Automated Texts"', /title="Automated Texts"/.test(toggle))
    check("…with simple On / Off copy", /"On —/.test(toggle) && /"Off —/.test(toggle))
    check(
      "the authoritative write still goes through the one server route",
      /fetch\(`\/api\/leads\/\$\{leadId\}\/automated-texting`/.test(toggle),
    )
    check("…and the control itself touches no table directly", !/supabase|from\(["']leads/.test(toggle))
    check("…it does not conflate enrollment with SMS consent", !/sms_opt_in/.test(toggle))
    check("…nor with On Hold", !/held_at|heldAt/.test(toggle))

    // No surface may write followup_opt_in from the browser: the column's UPDATE is
    // revoked from `authenticated`/`anon` AND trigger-guarded, so a direct client
    // write would fail at runtime rather than at review time.
    const clientWriters: string[] = []
    for (const f of ["components/crm/DashboardClient.tsx", "components/crm/AutomatedTextsToggle.tsx"]) {
      const src = readFileSync(f, "utf8")
      for (const m of src.matchAll(/\.update\(\s*\{[^}]*followup_opt_in[^}]*\}/g)) {
        clientWriters.push(`${f}:${src.slice(0, m.index!).split("\n").length}`)
      }
    }
    check("no client-side PostgREST write of followup_opt_in", clientWriters.length === 0, clientWriters.join(", "))

    const route = readFileSync("app/api/leads/[id]/automated-texting/route.ts", "utf8")
    check("the route writes with the service role", /supabaseAdmin[\s\S]{0,200}followup_opt_in: enabled/.test(route))
    check("…behind workspace membership", /requireWorkspaceMember\(\)/.test(route))
    check("…and live account authorization", /is_automated_texting_authorized/.test(route))
    check("…scoped to the caller's workspace", /\.eq\("workspace_id", workspaceId\)/.test(route))
    check("…and it still never sends anything", !/twilio|sendNotification|insertIntent|followup_outbound_intents/i.test(route))
    check(
      "turning automation off removes no Agenda/Next Action row",
      !/lead_next_actions/.test(route) && !/lead_next_actions/.test(toggle),
    )
  }


}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}).catch((e) => {
  console.error(e)
  process.exit(1)
})
