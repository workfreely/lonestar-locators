// EVENT-TRIGGERED SEQUENCES ARE AUTHORITATIVE — lifecycle enrollment must not displace them.
//
// THE DEFECT. applicableSequence() is deliberately lifecycle-only: it never returns future_move,
// resume_search, post_tour or tour, because those are created by an explicit event. gate.ts step 3
// has always honoured that distinction. enrollLifecycleRuns did not: it fetched the lead's active
// run, compared its sequence_key against applicableSequence(), found they disagreed — as they
// ALWAYS will for an event-triggered run — superseded it with stop_reason 'sequence_superseded',
// and installed a lifecycle run in its place.
//
// The cost in production: a client with a future move-in date, or one who pressed Resume Search,
// silently lost their reactivation message and received a generic new-lead greeting instead.
//
// THE FIX is the same rule the gate uses, applied in the enroller. It does NOT freeze lifecycle
// transitions: the skip only applies while the event-triggered run is still waiting/due, which is
// all activeLifecycleRun returns, so normal enrollment resumes the moment it completes or cancels.
//
// In-memory store only — no network, no database, no messages.
// Run: npx tsx scripts/tests/eventTriggeredEnrollment.test.ts
import { enrollLifecycleRuns } from "../../lib/followup/engine"
import { LIFECYCLE_SEQUENCES } from "../../lib/followup/sequences"
import { InMemoryFollowupStore, type SeedLead } from "../../lib/followup/sim/inMemoryStore"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const WS = "ws1", OWNER = "owner1"
const T0 = new Date("2026-09-28T14:20:00Z")

function fresh() {
  const store = new InMemoryFollowupStore(() => T0)
  store.putLead({
    id: 1, first_name: "Sarah", phone: "+15551230000", beds: "1", held_at: null, property_type: null,
    move_date: "2026-12-30", crm_status: "new", sms_opt_in: true, followup_opt_in: true,
    followup_enrolled_at: null, applied_at: null, created_at: T0.toISOString(),
    owner_user_id: OWNER, workspace_id: WS, agentFirstName: "Jay",
    timeZone: "America/Chicago", accountAuthorized: true,
  } as unknown as SeedLead)
  return store
}
const installRun = (store: InMemoryFollowupStore, sequence_key: string, step_key: string, status = "waiting") =>
  store.insertRun({
    lead_id: 1, workspace_id: WS, owner_user_id: OWNER, mode: "auto", sequence_key, step_key,
    step_index: 0, status, next_eligible_at: T0.toISOString(), baseline_inbound_at: null,
    sequence_version: 1, session_date: null, session_tour_count: null,
  } as never)
const runsOf = (store: InMemoryFollowupStore) => store.runsForLead(1)
const active = (store: InMemoryFollowupStore) => runsOf(store).filter((r) => ["waiting", "due"].includes(String(r.status)))

async function main() {
  // ── 1. THE TWO SEQUENCES THE DEFECT DESTROYED ─────────────────────────────
  console.log("1. an active event-triggered run survives lifecycle enrollment:")
  for (const [seq, step] of [["future_move", "reactivate"], ["resume_search", "resume"]] as const) {
    const store = fresh()
    await installRun(store, seq, step)
    const enrolled = await enrollLifecycleRuns(store, T0)
    const mine = runsOf(store).find((r) => r.sequence_key === seq)
    ok(`${seq} is NOT superseded`, mine?.status === "waiting" && !mine?.stop_reason)
    ok(`${seq}: no competing lifecycle run is created`, enrolled === 0 && runsOf(store).length === 1)
    ok(`${seq}: exactly one active run remains`, active(store).length === 1)
  }

  // ── 2. LIFECYCLE SUPERSESSION STILL WORKS ─────────────────────────────────
  console.log("\n2. lifecycle → lifecycle supersession is unchanged:")
  {
    const store = fresh()
    await installRun(store, "new_lead", "contact_fu1")
    store.setShare(1, { sentAt: T0.toISOString() } as never) // the agent sent a list
    await enrollLifecycleRuns(store, T0)
    const old = runsOf(store).find((r) => r.sequence_key === "new_lead")
    const now = runsOf(store).find((r) => r.sequence_key === "list_sent")
    ok("the stale new_lead run IS superseded", old?.status === "superseded" && old?.stop_reason === "sequence_superseded")
    ok("…and list_sent takes over", !!now && ["waiting", "due"].includes(String(now.status)))
    ok("…leaving exactly one active run", active(store).length === 1)
  }

  // ── 3. IT DOES NOT BLOCK ENROLLMENT FOREVER ───────────────────────────────
  console.log("\n3. enrollment resumes once the event-triggered run is finished:")
  for (const end of ["completed", "canceled", "superseded"] as const) {
    const store = fresh()
    await installRun(store, "future_move", "reactivate", end)
    const enrolled = await enrollLifecycleRuns(store, T0)
    ok(`after the run is ${end}, lifecycle enrollment proceeds`, enrolled === 1)
    ok(`…and the finished run is left alone`, runsOf(store).find((r) => r.sequence_key === "future_move")?.status === end)
    ok(`…with exactly one active run afterwards`, active(store).length === 1)
  }

  // ── 4. NO DUPLICATES ON REPEATED TICKS ────────────────────────────────────
  console.log("\n4. repeated ticks create nothing extra:")
  {
    const store = fresh()
    await installRun(store, "future_move", "reactivate")
    for (let i = 0; i < 5; i++) await enrollLifecycleRuns(store, T0)
    ok("five ticks leave the single event-triggered run untouched", runsOf(store).length === 1 && active(store).length === 1)
  }
  {
    const store = fresh()
    for (let i = 0; i < 5; i++) await enrollLifecycleRuns(store, T0)
    ok("five ticks on a bare lead create exactly ONE lifecycle run", runsOf(store).length === 1)
  }

  // ── 5. THE RULE ITSELF ────────────────────────────────────────────────────
  console.log("\n5. the registry still says which sequences are lifecycle-derived:")
  ok("lifecycle set is exactly the four derivable sequences",
    [...LIFECYCLE_SEQUENCES].sort().join(",") === "application_status,done_selecting,list_sent,new_lead")
  for (const s of ["future_move", "resume_search", "post_tour", "tour"]) {
    ok(`${s} is event-triggered, not lifecycle`, !LIFECYCLE_SEQUENCES.has(s as never))
  }

  console.log(`\nEvent-triggered enrollment: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
void main()
