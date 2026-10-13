// A STALE LIFECYCLE EVENT MUST NOT RE-ENROL ON EVERY TICK.
//
// THE DEFECT. Every lifecycle seed anchors its first step to the durable event that defines the
// sequence — client_recommendation_shares.sent_at, done_selecting_at, leads.applied_at. For an
// event long in the past that anchor is already overdue, so enrollLifecycleRuns created the run
// `waiting`, the SAME tick's dispatcher pass found it due, and the gate answered `stale_sequence`
// → cancel. A cancelled run no longer matches activeLifecycleRun, so the next tick built another.
// One run created and cancelled every minute, for ever, per affected lead: ~1,440 rows a day each
// carrying three snapshot reads, and the client never received a thing.
//
// Reached by the most ordinary action available — enabling Automated Texts on an existing client,
// or restoring an archived one — because almost every real client's list was sent days ago.
//
// THE FIX. enrollLifecycleRuns asks isStaleStep the same question the gate asks, with the same
// per-sequence bounds, one step earlier: a seed whose moment has passed is never written at all.
// No bound is changed, duplicated or relaxed — section 5 proves the gate still cancels a run that
// goes stale AFTER it was legitimately created, and section 3 proves a genuinely new event still
// enrols, because staleness is measured from the EVENT and a new event is never stale.
//
// In-memory store only — no network, no database, no device, no messages.
// Run: npx tsx scripts/tests/staleEnrollment.test.ts
import { enrollLifecycleRuns, tick } from "../../lib/followup/engine"
import { InMemoryFollowupStore, type SeedLead } from "../../lib/followup/sim/inMemoryStore"
import {
  LIST_SENT_MAX_OVERDUE_MS,
  APPLICATION_MAX_OVERDUE_MS,
  DONE_SELECTING_MAX_OVERDUE_MS,
} from "../../lib/followup/staleness"
import {
  LIST_FU1_DELAY_DAYS,
  APPLICATION_STATUS_DELAY_CAL_DAYS,
} from "../../lib/followup/cadence"
import { DONE_SELECTING_GRACE_MS } from "../../lib/followup/pacing"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    pass++
    console.log(`  ✓ ${label}`)
  } else {
    fail++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const WS = "ws1"
const OWNER = "owner1"

// 09:45 America/Chicago — inside allowed hours AND the routine morning band, so no
// quiet-hours or outside-window reschedule can masquerade as the behaviour under test.
const T0 = new Date("2026-09-23T14:45:00Z")
let NOW = new Date(T0)
const clock = () => NOW
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

function fresh(over: Partial<SeedLead> = {}) {
  NOW = new Date(T0)
  const store = new InMemoryFollowupStore(clock)
  store.putLead({
    id: 1,
    first_name: "Sarah",
    phone: "+15551230000",
    beds: "1",
    held_at: null,
    property_type: null,
    move_date: "2026-12-30",
    crm_status: "list_sent",
    sms_opt_in: true,
    followup_opt_in: true,
    followup_enrolled_at: ago(DAY),
    applied_at: null,
    created_at: ago(60 * DAY),
    ooo_held_at: null,
    ooo_released_at: null,
    owner_user_id: OWNER,
    workspace_id: WS,
    agentFirstName: "Jay",
    timeZone: "America/Chicago",
    accountAuthorized: true,
    ...(over as object),
  } as unknown as SeedLead)
  return store
}

/** One cron minute: the three producers, then the dispatcher pass — exactly as tick() does. */
async function cronMinute(store: InMemoryFollowupStore) {
  const summary = await tick(store, NOW)
  NOW = new Date(NOW.getTime() + MIN)
  return summary
}

const runs = (store: InMemoryFollowupStore) => store.runsForLead(1)
const activeRuns = (store: InMemoryFollowupStore) =>
  runs(store).filter((r) => ["waiting", "due"].includes(String(r.status)))

async function main() {
  // ── 1. THE DEFECT: repeated ticks must not multiply cancelled runs ──────────
  console.log("1. a stale lifecycle event creates NO run, however many ticks pass:")
  {
    // Each anchor is pushed one minute PAST its own bound, so every case is genuinely
    // expired rather than merely old — derived from the constants, never hardcoded.
    const cases: Array<[string, (s: InMemoryFollowupStore) => void]> = [
      [
        "list_sent (share sent past fu1 + bound)",
        (s) => s.setShare(1, { sentAt: ago(LIST_FU1_DELAY_DAYS * DAY + LIST_SENT_MAX_OVERDUE_MS + MIN) } as never),
      ],
      [
        "application_status (applied past ask + bound)",
        (s) => s.patchLead(1, {
          applied_at: ago(APPLICATION_STATUS_DELAY_CAL_DAYS * DAY + APPLICATION_MAX_OVERDUE_MS + MIN),
          crm_status: "applied",
        } as never),
      ],
      [
        "done_selecting (finished past grace + bound)",
        (s) => s.setShare(1, {
          sentAt: ago(90 * DAY),
          doneSelectingAt: ago(DONE_SELECTING_GRACE_MS + DONE_SELECTING_MAX_OVERDUE_MS + MIN),
          favoritedCount: 3,
        } as never),
      ],
    ]
    for (const [label, seed] of cases) {
      const store = fresh()
      seed(store)
      let enrolledTotal = 0
      let canceledTotal = 0
      for (let i = 0; i < 10; i++) {
        const s = await cronMinute(store)
        enrolledTotal += s.enrolled
        canceledTotal += s.canceled
      }
      ok(`${label}: zero runs after 10 ticks`, runs(store).length === 0, `got ${runs(store).length}`)
      ok(`${label}: nothing enrolled and nothing cancelled`, enrolledTotal === 0 && canceledTotal === 0,
        `enrolled=${enrolledTotal} canceled=${canceledTotal}`)
      ok(`${label}: no intent created`, store.intentsForLead(1).length === 0)
    }
  }

  // ── 2. THE BOUNDARY IS THE EXISTING BOUND, NOT A NEW ONE ───────────────────
  console.log("\n2. the cutoff is exactly isStaleStep's own per-sequence bound:")
  {
    // list_sent: fu1 is due at sent_at + 1 day and may be up to LIST_SENT_MAX_OVERDUE_MS late.
    const expiresAfter = LIST_FU1_DELAY_DAYS * DAY + LIST_SENT_MAX_OVERDUE_MS
    const justInside = fresh()
    justInside.setShare(1, { sentAt: ago(expiresAfter - MIN) } as never)
    await cronMinute(justInside)
    const inside = runs(justInside)
    ok("one minute INSIDE the bound: the run is created", inside.length === 1 && inside[0].sequence_key === "list_sent",
      `got ${inside.length}`)
    ok("…and it is not cancelled", inside[0]?.status !== "canceled", String(inside[0]?.stop_reason))

    const justOutside = fresh()
    justOutside.setShare(1, { sentAt: ago(expiresAfter + MIN) } as never)
    await cronMinute(justOutside)
    ok("one minute OUTSIDE the bound: no run is created", runs(justOutside).length === 0,
      `got ${runs(justOutside).length}`)
  }

  // ── 3. A GENUINELY NEW EVENT STILL ENROLS ──────────────────────────────────
  console.log("\n3. fresh legitimate events enrol normally (the agent is not disabled):")
  {
    const freshCases: Array<[string, string, (s: InMemoryFollowupStore) => void]> = [
      ["list_sent", "fu1", (s) => s.setShare(1, { sentAt: ago(2 * HOUR) } as never)],
      ["done_selecting", "evaluate", (s) =>
        s.setShare(1, { sentAt: ago(3 * DAY), doneSelectingAt: ago(5 * MIN), favoritedCount: 2 } as never)],
      ["application_status", "ask", (s) =>
        s.patchLead(1, { applied_at: ago(2 * HOUR), crm_status: "applied" } as never)],
      ["new_lead", "t1", (s) => s.patchLead(1, { created_at: ago(10 * MIN), crm_status: "new" } as never)],
    ]
    for (const [seq, step, seed] of freshCases) {
      const store = fresh()
      seed(store)
      await cronMinute(store)
      const mine = runs(store)
      ok(`${seq}: exactly one run, on step ${step}`,
        mine.length === 1 && mine[0].sequence_key === seq && mine[0].step_key === step,
        mine.map((r) => `${r.sequence_key}/${r.step_key}:${r.status}`).join(",") || "none")
      ok(`${seq}: the run is live, not cancelled`, ["waiting", "due"].includes(String(mine[0]?.status)),
        String(mine[0]?.status))
    }
  }

  // ── 4. STALE, THEN A GENUINELY NEW LIST: enrolment must resume ─────────────
  console.log("\n4. a NEW list on a previously-stale lead enrols (the guard gates the event, not the lead):")
  {
    const store = fresh()
    store.setShare(1, { sentAt: ago(60 * DAY) } as never)
    for (let i = 0; i < 5; i++) await cronMinute(store)
    ok("the stale anchor produced nothing", runs(store).length === 0, `got ${runs(store).length}`)

    // The locator sends a new list. sent_at moves to now; the anchor lands in the future.
    store.setShare(1, { sentAt: NOW.toISOString() } as never)
    await cronMinute(store)
    const after = runs(store)
    ok("the new list enrols a list_sent run", after.length === 1 && after[0].sequence_key === "list_sent",
      after.map((r) => r.sequence_key).join(",") || "none")
    ok("it is waiting on fu1, due in the future", after[0]?.step_key === "fu1" && after[0]?.status === "waiting")

    // And it must not duplicate on subsequent ticks.
    for (let i = 0; i < 5; i++) await cronMinute(store)
    ok("five further ticks add no second run", runs(store).length === 1, `got ${runs(store).length}`)
    ok("still exactly one active run", activeRuns(store).length === 1)
  }

  // ── 5. STALENESS PROTECTION IS NOT WEAKENED ────────────────────────────────
  console.log("\n5. a run that goes stale AFTER being created is still cancelled by the gate:")
  {
    const store = fresh()
    store.setShare(1, { sentAt: ago(2 * HOUR) } as never) // fresh → legitimately enrols
    await cronMinute(store)
    ok("the fresh run exists", runs(store).length === 1 && runs(store)[0].status === "waiting")

    // Beast Sync is offline for a week; the step is now far past its bound.
    NOW = new Date(NOW.getTime() + LIST_FU1_DELAY_DAYS * DAY + LIST_SENT_MAX_OVERDUE_MS + DAY)
    const summary = await cronMinute(store)
    const after = runs(store)
    ok("the overdue run is CANCELLED, not sent late",
      after.length === 1 && after[0].status === "canceled" && after[0].stop_reason === "stale_sequence",
      `${after[0]?.status}/${after[0]?.stop_reason}`)
    ok("the gate did the cancelling (summary.canceled === 1)", summary.canceled === 1, String(summary.canceled))
    ok("no message was enqueued", store.intentsForLead(1).length === 0)

    // …and the now-stale event must not re-enrol on the following ticks.
    for (let i = 0; i < 5; i++) await cronMinute(store)
    ok("it does not re-enrol afterwards (no churn resumes)", runs(store).length === 1, `got ${runs(store).length}`)
  }

  // ── 6. OLDER LEADS AND ARCHIVE / RESTORE ───────────────────────────────────
  console.log("\n6. older leads, and archive → restore:")
  {
    // An old lead with no share at all: new_lead applies, the enrolment window refuses it.
    const old = fresh({ created_at: new Date(T0.getTime() - 60 * DAY).toISOString(), crm_status: "new" })
    for (let i = 0; i < 5; i++) await cronMinute(old)
    ok("a 60-day-old lead with no list: no run, no churn", runs(old).length === 0, `got ${runs(old).length}`)

    // Archived: excluded from enrolment entirely.
    const archived = fresh({ crm_status: "archived" })
    archived.setShare(1, { sentAt: ago(60 * DAY) } as never)
    for (let i = 0; i < 3; i++) await cronMinute(archived)
    ok("an archived lead enrols nothing", runs(archived).length === 0)

    // Restored with a STALE list — the churn case this defect made worst.
    const restoredStale = fresh({ crm_status: "archived" })
    restoredStale.setShare(1, { sentAt: ago(60 * DAY) } as never)
    await cronMinute(restoredStale)
    restoredStale.patchLead(1, { crm_status: "list_sent" } as never) // the restore
    for (let i = 0; i < 10; i++) await cronMinute(restoredStale)
    ok("restoring a lead with a stale list creates NO run", runs(restoredStale).length === 0,
      `got ${runs(restoredStale).length}`)
    ok("…and replays no introduction", store_noIntro(restoredStale))

    // Restored with a RECENT list — must still work.
    const restoredFresh = fresh({ crm_status: "archived" })
    restoredFresh.setShare(1, { sentAt: ago(2 * HOUR) } as never)
    await cronMinute(restoredFresh)
    ok("while archived, nothing enrols", runs(restoredFresh).length === 0)
    restoredFresh.patchLead(1, { crm_status: "list_sent" } as never)
    await cronMinute(restoredFresh)
    ok("restoring a lead with a recent list DOES enrol list_sent",
      runs(restoredFresh).length === 1 && runs(restoredFresh)[0].sequence_key === "list_sent",
      runs(restoredFresh).map((r) => r.sequence_key).join(",") || "none")
  }

  // ── 7. THE PRODUCER IS IDEMPOTENT ON ITS OWN ───────────────────────────────
  console.log("\n7. enrollLifecycleRuns alone, called repeatedly:")
  {
    const store = fresh()
    store.setShare(1, { sentAt: ago(60 * DAY) } as never)
    let total = 0
    for (let i = 0; i < 20; i++) total += await enrollLifecycleRuns(store, NOW)
    ok("20 direct producer calls on a stale event enrol nothing", total === 0 && runs(store).length === 0,
      `enrolled=${total} runs=${runs(store).length}`)

    const live = fresh()
    live.setShare(1, { sentAt: ago(2 * HOUR) } as never)
    let liveTotal = 0
    for (let i = 0; i < 20; i++) liveTotal += await enrollLifecycleRuns(live, NOW)
    ok("20 calls on a fresh event enrol exactly once", liveTotal === 1 && runs(live).length === 1,
      `enrolled=${liveTotal} runs=${runs(live).length}`)
  }

  console.log(`\n${pass} checks passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

/** No new_lead intent of any kind was produced for this lead. */
function store_noIntro(store: InMemoryFollowupStore): boolean {
  return !store.intentsForLead(1).some((i) => i.sequence_key === "new_lead")
}

main()
