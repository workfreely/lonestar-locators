// THE OPENING DOUBLE TEXT IS SENT ONCE PER CLIENT, FOR EVER — from stored history, not a clock.
//
// WHAT PROTECTED IT BEFORE. Only `now - created_at > 6h` in lifecycleSeed plus the
// one-active-lifecycle index. Both are real, but neither records the FACT that a client has been
// introduced, so every guarantee rested on a coincidence of timing. The reachable hole: a share
// whose sent_at is cleared flips applicableSequence back to new_lead, and inside the six-hour
// window the enroller would happily open the intro a second time.
//
// WHAT PROTECTS IT NOW. followup_outbound_intents is already a durable per-message ledger — the
// row outlives its run (run_id is ON DELETE SET NULL), supersession rewrites only
// dispatch_status, and nothing deletes intents on archive, restore, stage change or restart. The
// enroller asks it directly, per STEP, so Text 1 and Text 2 are tracked independently.
//
// 'pending' / 'claimed' / 'sent' all block — the same predicate as
// followup_intents_active_step_uidx. `claimed` is UNCERTAIN (the device may have delivered it and
// lost the ack) and still blocks, because a duplicate opening text is worse than a missing one.
// 'failed' and 'superseded' are confirmed NOT sent and deliberately do not block.
//
// In-memory store only — no network, no database, no device, no messages.
// Run: npx tsx scripts/tests/oneTimeIntro.test.ts
import { enrollLifecycleRuns, tick, runClaim, runAck } from "../../lib/followup/engine"
import { InMemoryFollowupStore, type SeedLead } from "../../lib/followup/sim/inMemoryStore"

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
const DEV = "mac-1"

// 09:45 America/Chicago — inside allowed hours and the morning band, so no quiet-hours
// or outside-window reschedule can be mistaken for the behaviour under test.
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
    crm_status: "new",
    sms_opt_in: true,
    followup_opt_in: true,
    followup_enrolled_at: ago(10 * MIN),
    applied_at: null,
    created_at: ago(10 * MIN), // inside the 6h enrolment window
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

async function cronMinute(store: InMemoryFollowupStore) {
  const s = await tick(store, NOW)
  NOW = new Date(NOW.getTime() + MIN)
  return s
}

/** Play the Mac: claim everything claimable and ack it. */
async function deliver(store: InMemoryFollowupStore, status: "sent" | "failed" = "sent") {
  const jobs = await runClaim(store, NOW, DEV, WS)
  for (const j of jobs) {
    await runAck(store, {
      intentId: j.intentId, workspaceId: WS, deviceId: DEV, status,
      localSentAt: NOW.toISOString(), spacingMs: () => 30_000,
    })
  }
  return jobs.map((j) => j.stepKey)
}

const intents = (s: InMemoryFollowupStore) => s.intentsForLead(1)
const stepsOf = (s: InMemoryFollowupStore, step: string) => intents(s).filter((i) => i.step_key === step)
const runs = (s: InMemoryFollowupStore) => s.runsForLead(1)

/** Drive t1 → t2 all the way to delivered, the way production would. */
async function sendTheIntro(store: InMemoryFollowupStore) {
  await cronMinute(store) // enrol, t1 @ +5m
  NOW = new Date(NOW.getTime() + 5 * MIN)
  await cronMinute(store) // enqueue t1
  const first = await deliver(store) // send + ack t1 → pre-enqueues t2
  NOW = new Date(NOW.getTime() + MIN)
  const second = await deliver(store) // send + ack t2
  return [...first, ...second]
}

async function main() {
  // ── 1. THE PAIR SENDS ONCE, NORMALLY ──────────────────────────────────────
  console.log("1. the opening pair still sends, exactly once, in order:")
  {
    const store = fresh()
    const sent = await sendTheIntro(store)
    ok("t1 then t2 were delivered", sent.join(",") === "t1,t2", sent.join(",") || "nothing")
    ok("exactly one t1 intent", stepsOf(store, "t1").length === 1)
    ok("exactly one t2 intent", stepsOf(store, "t2").length === 1)
    ok("both recorded as sent", intents(store).every((i) => i.dispatch_status === "sent"))
    // The pair is NOT the end of new_lead: t2 advances the run onto the pre-list contact
    // chase (contact_fu1 at +2 days). Asserting "completed" here would be asserting a bug.
    const run = runs(store).find((r) => r.sequence_key === "new_lead")
    ok("the run advanced onto the contact chase, not completed",
      run?.step_key === "contact_fu1" && run?.status === "waiting", `${run?.status}/${run?.step_key}`)

    // 30 further cron minutes must not reopen anything.
    for (let i = 0; i < 30; i++) await cronMinute(store)
    ok("30 further ticks add no third intent", intents(store).length === 2, `got ${intents(store).length}`)
    ok("…and no second new_lead run", runs(store).filter((r) => r.sequence_key === "new_lead").length === 1)
  }

  // ── 2. THE REACHABLE HOLE THIS CLOSES ─────────────────────────────────────
  console.log("\n2. a cleared share flips applicableSequence back to new_lead — intro must NOT replay:")
  {
    const store = fresh()
    await sendTheIntro(store)
    // The locator sends a list: new_lead is superseded by list_sent.
    store.setShare(1, { sentAt: NOW.toISOString() } as never)
    await cronMinute(store)
    ok("list_sent took over", runs(store).some((r) => r.sequence_key === "list_sent"))
    // …and the share is then cleared (a correction, a re-send, a data fix), still inside 6h of creation.
    store.setShare(1, { sentAt: null } as never)
    for (let i = 0; i < 10; i++) await cronMinute(store)
    ok("no second t1 intent", stepsOf(store, "t1").length === 1, `got ${stepsOf(store, "t1").length}`)
    ok("no second t2 intent", stepsOf(store, "t2").length === 1, `got ${stepsOf(store, "t2").length}`)
    ok("no new new_lead run was opened",
      runs(store).filter((r) => r.sequence_key === "new_lead").length === 1,
      String(runs(store).filter((r) => r.sequence_key === "new_lead").length))
  }

  // ── 3. EVERY EVENT YOU LISTED, AGAINST A LEAD THAT HAS BEEN INTRODUCED ────
  console.log("\n3. no replay after any of the listed events:")
  {
    const events: Array<[string, (s: InMemoryFollowupStore) => void]> = [
      ["CRM stage change (new → contacted)", (s) => s.patchLead(1, { crm_status: "contacted" } as never)],
      ["stage change to searching", (s) => s.patchLead(1, { crm_status: "searching" } as never)],
      ["archived", (s) => s.patchLead(1, { crm_status: "archived" } as never)],
      ["archived then restored", (s) => s.patchLead(1, { crm_status: "new" } as never)],
      ["repeat Smart Lead Form (fields updated, created_at kept)", (s) =>
        s.patchLead(1, { beds: "2", move_date: "2027-01-15" } as never)],
      ["sequence supersession (list sent)", (s) => s.setShare(1, { sentAt: NOW.toISOString() } as never)],
      ["Future Move state (On Hold with a resume date)", (s) =>
        s.patchLead(1, { held_at: NOW.toISOString() } as never)],
      ["Resume Search event", (s) => s.setShare(1, { resumedAt: NOW.toISOString() } as never)],
    ]
    for (const [label, mutate] of events) {
      const store = fresh()
      await sendTheIntro(store)
      mutate(store)
      for (let i = 0; i < 10; i++) await cronMinute(store)
      ok(`${label}: still exactly one t1`, stepsOf(store, "t1").length === 1,
        `got ${stepsOf(store, "t1").length}`)
    }
  }

  // ── 4. SCHEDULER RESTART ──────────────────────────────────────────────────
  console.log("\n4. a scheduler restart cannot replay the intro (history is in the store, not memory):")
  {
    const store = fresh()
    await sendTheIntro(store)
    // A restart is a brand-new engine call sequence against the SAME store — no in-process state.
    let enrolled = 0
    for (let i = 0; i < 20; i++) enrolled += await enrollLifecycleRuns(store, NOW)
    ok("20 cold producer calls enrol nothing", enrolled === 0, String(enrolled))
    ok("still exactly one t1 and one t2",
      stepsOf(store, "t1").length === 1 && stepsOf(store, "t2").length === 1)
  }

  // ── 5. PARTIAL COMPLETION: t1 sent, t2 not ────────────────────────────────
  console.log("\n5. partial completion — t1 confirmed, t2 failed: never repeat t1:")
  {
    const store = fresh()
    await cronMinute(store)
    NOW = new Date(NOW.getTime() + 5 * MIN)
    await cronMinute(store)
    const first = await deliver(store, "sent") // t1 sent
    ok("t1 was sent", first.join(",") === "t1", first.join(","))
    NOW = new Date(NOW.getTime() + MIN)
    const second = await deliver(store, "failed") // t2 FAILS
    ok("t2 was attempted and failed", second.join(",") === "t2", second.join(","))
    ok("t1 remains sent", stepsOf(store, "t1")[0]?.dispatch_status === "sent")
    ok("t2 is recorded failed", stepsOf(store, "t2").some((i) => i.dispatch_status === "failed"))

    // The run is back to waiting ON t2, and retries t2 only.
    const run = runs(store).find((r) => r.sequence_key === "new_lead")
    ok("the run is waiting on t2, not t1", run?.step_key === "t2" && run?.status === "waiting",
      `${run?.status}/${run?.step_key}`)
    for (let i = 0; i < 10; i++) await cronMinute(store)
    ok("t1 is NEVER re-enqueued to complete the pair", stepsOf(store, "t1").length === 1,
      `got ${stepsOf(store, "t1").length}`)
  }

  // ── 6. UNCERTAIN ACKNOWLEDGMENT COUNTS AS SENT ────────────────────────────
  console.log("\n6. an intent stuck 'claimed' (lost ack) blocks a second intro:")
  {
    const store = fresh()
    await cronMinute(store)
    NOW = new Date(NOW.getTime() + 5 * MIN)
    await cronMinute(store)
    const jobs = await runClaim(store, NOW, DEV, WS) // claimed, then the Mac vanishes
    ok("t1 was claimed", jobs.length === 1 && jobs[0].stepKey === "t1")
    ok("the intent is 'claimed', never acked", stepsOf(store, "t1")[0]?.dispatch_status === "claimed")

    // The stranded run holds the lifecycle slot, so force the worst case: cancel the run
    // and prove the LEDGER alone still refuses a second intro.
    const run = runs(store).find((r) => r.sequence_key === "new_lead")
    await store.updateRun(String(run?.id), { status: "canceled", stop_reason: "forced_for_test" })
    ok("the run is no longer active", runs(store).every((r) => !["waiting", "due"].includes(String(r.status))))
    for (let i = 0; i < 10; i++) await cronMinute(store)
    ok("NO second t1 intent, on the strength of the ledger alone",
      stepsOf(store, "t1").length === 1, `got ${stepsOf(store, "t1").length}`)
    ok("no new new_lead run", runs(store).filter((r) => r.sequence_key === "new_lead").length === 1)
  }

  // ── 7. A CONFIRMED FAILURE DOES *NOT* BLOCK — a real retry stays possible ─
  console.log("\n7. confirmed-not-sent must NOT block (an undelivered intro is still owed):")
  {
    const store = fresh()
    await cronMinute(store)
    NOW = new Date(NOW.getTime() + 5 * MIN)
    await cronMinute(store)
    await deliver(store, "failed") // t1 FAILED — the device confirmed nothing went out
    ok("t1 is recorded failed", stepsOf(store, "t1").some((i) => i.dispatch_status === "failed"))
    ok("the ledger does not count it as sent",
      (await store.intentExistsForStep(1, "new_lead", "t1")) === false)

    // The run is back to waiting on t1 and may legitimately re-enqueue.
    const run = runs(store).find((r) => r.sequence_key === "new_lead")
    ok("the run is waiting on t1", run?.step_key === "t1" && run?.status === "waiting",
      `${run?.status}/${run?.step_key}`)
    await cronMinute(store)
    ok("a retry intent IS created for t1", stepsOf(store, "t1").length === 2,
      `got ${stepsOf(store, "t1").length}`)
  }

  // ── 8. A SUPERSEDED INTENT DOES NOT BLOCK EITHER ──────────────────────────
  console.log("\n8. a withdrawn (superseded) intent is confirmed-not-sent and does not block:")
  {
    const store = fresh()
    await cronMinute(store)
    NOW = new Date(NOW.getTime() + 5 * MIN)
    await cronMinute(store)
    const t1 = stepsOf(store, "t1")[0]
    await store.updateIntent(String(t1.id), { dispatch_status: "superseded", idempotency_key: null })
    ok("the ledger does not count a superseded intent as sent",
      (await store.intentExistsForStep(1, "new_lead", "t1")) === false)
  }

  // ── 9. OPT-OUT STILL WINS, AND IS UNAFFECTED BY THE GUARD ─────────────────
  console.log("\n9. an existing opt-out still prevents everything:")
  {
    const store = fresh({ sms_opt_in: false })
    for (let i = 0; i < 10; i++) await cronMinute(store)
    ok("an opted-out lead enrols nothing", runs(store).length === 0 && intents(store).length === 0)

    // Opt-out AFTER the intro: no replay, and nothing further.
    const after = fresh()
    await sendTheIntro(after)
    after.patchLead(1, { sms_opt_in: false } as never)
    for (let i = 0; i < 10; i++) await cronMinute(after)
    ok("opting out after the intro adds nothing", intents(after).length === 2, `got ${intents(after).length}`)
  }

  // ── 10. THE LEDGER IS PER STEP, SO t1 AND t2 ARE INDEPENDENT ──────────────
  console.log("\n10. Text 1 and Text 2 are tracked independently:")
  {
    const store = fresh()
    await cronMinute(store)
    NOW = new Date(NOW.getTime() + 5 * MIN)
    await cronMinute(store)
    await deliver(store, "sent") // t1 only
    ok("t1 reads as sent", (await store.intentExistsForStep(1, "new_lead", "t1")) === true)
    ok("t2 reads as already queued (pre-enqueued by advanceRun)",
      (await store.intentExistsForStep(1, "new_lead", "t2")) === true)
    ok("an unrelated step reads as not sent",
      (await store.intentExistsForStep(1, "new_lead", "contact_fu1")) === false)
    ok("the same step on a DIFFERENT lead reads as not sent",
      (await store.intentExistsForStep(999, "new_lead", "t1")) === false)
    ok("a different sequence reads as not sent",
      (await store.intentExistsForStep(1, "list_sent", "t1")) === false)
  }

  // ── 11. OTHER SEQUENCES ARE UNTOUCHED ─────────────────────────────────────
  console.log("\n11. the guard is scoped to new_lead and nothing else:")
  {
    const store = fresh({ crm_status: "list_sent" })
    store.setShare(1, { sentAt: ago(2 * HOUR) } as never)
    await cronMinute(store)
    ok("list_sent still enrols normally",
      runs(store).length === 1 && runs(store)[0].sequence_key === "list_sent",
      runs(store).map((r) => r.sequence_key).join(",") || "none")
  }

  console.log(`\n${pass} checks passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main()
