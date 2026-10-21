/**
 * FOLLOW-UP LIFECYCLE FOUNDATION — gate precedence, Human Handoff, On Hold,
 * sequence producers and stale-intent protection.
 *
 * WRITTEN FAILING-FIRST. Before the precedence fix, a paused stale lifecycle run
 * returned `paused` from gate check 1 and was never superseded, so it occupied the
 * one-active-lifecycle slot forever and blocked every future enrollment. The
 * precedence block below fails on the old gate by construction.
 *
 * Run: npx tsx scripts/tests/followupLifecycle.test.ts
 */
import { evaluateSend } from "../../lib/followup/gate"
import { enrollLifecycleRuns, enrollResumeSearchRuns, tick } from "../../lib/followup/engine"
import { InMemoryFollowupStore, type SeedLead } from "../../lib/followup/sim/inMemoryStore"
import { readFileSync } from "node:fs"
import { HANDOFF_WINDOW_MS } from "../../lib/followup/pacing"
import { maxOverdueMs } from "../../lib/followup/staleness"
import type { ConversationSnapshot, LeadSnapshot, RunSnapshot, ShareSnapshot, SequenceKey } from "../../lib/followup/types"

// INTRO-ONLY MODE is the production default and refuses every step but new_lead t1/t2. This suite
// exercises LIFECYCLE supersession, pauses and holds across the gated sequences, so it arms the
// full set deliberately — otherwise every case cancels with "intro_only" before reaching the rule
// under test. The restriction is proved in scripts/tests/introOnlyMode.test.ts.
process.env.FOLLOWUP_ALL_SEQUENCES_ENABLED = "true"

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

// 09:45 CDT — inside BOTH the 09:00-21:00 allowed window and the narrower
// 09:00-10:30 morning band, so a morning-gated step (contact_fu*, list_sent,
// application_status) is sendable and `outside_window` never masks a result.
const NOW = new Date("2026-09-23T14:45:00Z")
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const lead = (over: Partial<LeadSnapshot> = {}): LeadSnapshot =>
  ({
    id: 1,
    firstName: "Sarah",
    agentFirstName: "Jay",
    beds: "1",
    propertyType: null,
    moveDate: "2026-10-01",
    moveMonthLabel: "October",
    crmStatus: "new",
    smsOptIn: true,
    accountAuthorized: true,
    followupOptIn: true,
    timeZone: "America/Chicago",
    appliedAt: null,
    heldAt: null,
    ...(over as object),
  }) as LeadSnapshot

const run = (over: Partial<RunSnapshot> = {}): RunSnapshot => ({
  sequenceKey: "new_lead",
  stepKey: "contact_fu1",
  stepIndex: 2,
  status: "due",
  mode: "auto",
  baselineInboundAt: null,
  nextEligibleAt: ago(MIN),
  ...over,
})

const conv = (over: Partial<ConversationSnapshot> = {}): ConversationSnapshot => ({
  lastInboundAt: null,
  lastManualOutboundAt: null,
  ...over,
})
const share = (over: Partial<ShareSnapshot> = {}): ShareSnapshot => ({
  sentAt: over.sentAt ?? null,
  doneSelectingAt: over.doneSelectingAt ?? null,
  favoritedCount: over.favoritedCount ?? 0,
  availabilitySubmittedAt: over.availabilitySubmittedAt ?? null,
  resumedAt: over.resumedAt ?? null,
})

/** `reason` exists on every decision EXCEPT "send" — narrow rather than cast. */
const reasonOf = (d: ReturnType<typeof evaluateSend>): string | null => ("reason" in d ? d.reason : null)

const decide = (
  l: LeadSnapshot = lead(),
  c: ConversationSnapshot = conv(),
  s: ShareSnapshot = share(),
  r: RunSnapshot = run(),
) => evaluateSend(NOW, l, c, s, r)

async function main() {
  console.log("\nFOLLOW-UP LIFECYCLE FOUNDATION\n")

  // ─── 1. GATE PRECEDENCE ────────────────────────────────────────────────────
  console.log("1. Gate precedence — supersession must outrank a locator pause")
  {
    // THE BUG: a paused new_lead run whose list has been sent. Supersession must
    // still retire it, or it holds the one-active-lifecycle slot forever and no
    // list_sent run can ever be created for this lead.
    const d = decide(lead(), conv(), share({ sentAt: ago(HOUR) }), run({ mode: "paused" }))
    check(
      "a PAUSED stale lifecycle run is still superseded (not held)",
      d.action === "cancel" && reasonOf(d) === "sequence_superseded",
      JSON.stringify(d),
    )
  }
  {
    const d = decide(lead({ heldAt: ago(HOUR) }), conv(), share({ sentAt: ago(HOUR) }), run())
    check(
      "an ON HOLD stale lifecycle run is still superseded",
      d.action === "cancel" && reasonOf(d) === "sequence_superseded",
      JSON.stringify(d),
    )
  }
  {
    const d = decide(lead({ crmStatus: "closed" }), conv(), share(), run({ mode: "paused" }))
    check("a paused run on a CLOSED lead still stands down", d.action === "cancel" && reasonOf(d) === "stage_changed", JSON.stringify(d))
  }
  console.log("  …while the hard stops still outrank supersession:")
  {
    const d = decide(lead({ smsOptIn: false }), conv(), share({ sentAt: ago(HOUR) }), run())
    check("opt-out beats supersession (reason stays opt_out)", d.action === "cancel" && reasonOf(d) === "opt_out", JSON.stringify(d))
  }
  {
    const d = decide(lead(), conv(), share({ sentAt: ago(HOUR) }), run({ mode: "stopped" }))
    check("stopped beats supersession", d.action === "cancel" && reasonOf(d) === "stopped", JSON.stringify(d))
  }
  {
    const d = decide(lead({ accountAuthorized: false }), conv(), share({ sentAt: ago(HOUR) }), run())
    check("authorization outranks everything", d.action === "hold" && reasonOf(d) === "not_authorized", JSON.stringify(d))
  }
  {
    const d = decide(lead({ followupOptIn: false }), conv(), share({ sentAt: ago(HOUR) }), run())
    check("enrollment outranks supersession", d.action === "hold" && reasonOf(d) === "not_enrolled", JSON.stringify(d))
  }
  console.log("  …and a pause still holds a run that is NOT stale:")
  {
    const d = decide(lead(), conv(), share(), run({ mode: "paused" }))
    check("a current run is held by the pause", d.action === "hold" && reasonOf(d) === "paused", JSON.stringify(d))
  }
  {
    const d = decide(lead(), conv(), share(), run({ mode: "manual" }))
    check("manual mode holds too", d.action === "hold" && reasonOf(d) === "paused", JSON.stringify(d))
  }

  // ─── 2. HUMAN HANDOFF ──────────────────────────────────────────────────────
  console.log("\n2. Human Handoff — a recency window, not a permanent baseline")
  check("the window is a named 4-hour constant", HANDOFF_WINDOW_MS === 4 * HOUR, String(HANDOFF_WINDOW_MS))
  {
    const d = decide(lead(), conv({ lastManualOutboundAt: ago(10 * MIN) }), share(), run())
    check("a manual text 10 min ago suppresses a full-gated step", d.action !== "send", JSON.stringify(d))
    check("…with reason manual_conversation", reasonOf(d) === "manual_conversation", String(reasonOf(d)))
  }
  {
    // THE BUG THIS REPLACES: the old rule compared against baselineInboundAt, which
    // never advances — so one manual text suppressed automation permanently.
    const d = decide(lead(), conv({ lastManualOutboundAt: ago(5 * HOUR) }), share(), run())
    check("a manual text 5 HOURS ago no longer suppresses anything", d.action === "send", JSON.stringify(d))
  }
  {
    const d = decide(lead(), conv({ lastManualOutboundAt: ago(3 * DAY) }), share(), run())
    check("a manual text 3 days ago does not suppress (the permanent-mute bug)", d.action === "send", JSON.stringify(d))
  }
  check(
    "the boundary is exclusive — just inside the window suppresses",
    decide(lead(), conv({ lastManualOutboundAt: ago(HANDOFF_WINDOW_MS - MIN) }), share(), run()).action !== "send",
  )
  check(
    "…and just outside it does not",
    decide(lead(), conv({ lastManualOutboundAt: ago(HANDOFF_WINDOW_MS + MIN) }), share(), run()).action === "send",
  )
  console.log("  consent-only steps are exempt (the opening pair must complete):")
  for (const [seq, step] of [["new_lead", "t1"], ["new_lead", "t2"], ["future_move", "wait_ack"]] as const) {
    const d = decide(
      lead(),
      conv({ lastManualOutboundAt: ago(MIN) }),
      share(),
      run({ sequenceKey: seq as SequenceKey, stepKey: step, stepIndex: 0 }),
    )
    check(`${seq}.${step} still sends during handoff`, d.action === "send", JSON.stringify(d))
  }
  check(
    "no manual outbound at all → no handoff",
    decide(lead(), conv({ lastManualOutboundAt: null }), share(), run()).action === "send",
  )

  // ─── 3. ON HOLD ────────────────────────────────────────────────────────────
  console.log("\n3. On Hold suppresses automated client texting")
  {
    const d = decide(lead({ heldAt: ago(DAY) }), conv(), share(), run())
    check("an On Hold lead's step is held", d.action === "hold", JSON.stringify(d))
    check("…with its own reason, distinct from a locator pause", reasonOf(d) === "on_hold", String(reasonOf(d)))
  }
  check(
    "On Hold suppresses the consent-only opening pair too (the client paused their search)",
    decide(lead({ heldAt: ago(DAY) }), conv(), share(), run({ stepKey: "t1", stepIndex: 0 })).action === "hold",
  )
  check(
    "a lead NOT on hold is unaffected",
    decide(lead({ heldAt: null }), conv(), share(), run()).action === "send",
  )
  check(
    "On Hold is a HOLD, never a cancel (so Resume re-evaluates rather than re-enrolling)",
    decide(lead({ heldAt: ago(30 * DAY) }), conv(), share(), run()).action === "hold",
  )

  // ─── 6. STALE INTENT / STALE STEP ──────────────────────────────────────────
  console.log("\n6. Stale automation fails closed")
  console.log("  per-sequence max overdue (not one global age):")
  check("new_lead t1 is the tightest", maxOverdueMs("new_lead", "t1") <= 6 * HOUR)
  check("new_lead t2 is tighter still (it is a 30-45s pair)", maxOverdueMs("new_lead", "t2") <= HOUR)
  check("the contact chase is more tolerant than the opening pair", maxOverdueMs("new_lead", "contact_fu1") > maxOverdueMs("new_lead", "t1"))
  check("post_tour is same-day", maxOverdueMs("post_tour", "ask") <= 12 * HOUR)
  check("application_status is the most tolerant", maxOverdueMs("application_status", "ask") >= 2 * DAY)
  check("every sequence resolves a positive bound", (["new_lead","list_sent","post_tour","application_status","done_selecting","resume_search","future_move"] as SequenceKey[]).every((s) => maxOverdueMs(s, "x") > 0))
  {
    // The requirement: "I got your form..." must not send days later.
    const d = decide(lead(), conv(), share(), run({ stepKey: "t1", stepIndex: 0, nextEligibleAt: ago(3 * DAY) }))
    check("a 3-day-overdue New Lead Text 1 is CANCELLED, not sent", d.action === "cancel", JSON.stringify(d))
    check("…with reason stale_sequence", reasonOf(d) === "stale_sequence", String(reasonOf(d)))
  }
  check(
    "a Text 1 that is only minutes overdue still sends",
    decide(lead(), conv(), share(), run({ stepKey: "t1", stepIndex: 0, nextEligibleAt: ago(2 * MIN) })).action === "send",
  )
  check(
    "a 3-day-overdue contact follow-up is also cancelled",
    decide(lead(), conv(), share(), run({ stepKey: "contact_fu1", nextEligibleAt: ago(5 * DAY) })).action === "cancel",
  )
  check(
    "staleness is only judged once a step is actually due",
    reasonOf(decide(lead(), conv(), share(), run({ nextEligibleAt: new Date(NOW.getTime() + HOUR).toISOString() }))) ===
      "not_eligible_yet",
  )

  // ─── Precedence of the new checks against each other ───────────────────────
  console.log("\nThe new checks compose correctly")
  check(
    "On Hold outranks handoff (both suppress; On Hold is the durable one)",
    reasonOf(decide(lead({ heldAt: ago(DAY) }), conv({ lastManualOutboundAt: ago(MIN) }), share(), run())) === "on_hold",
  )
  check(
    "opt-out outranks On Hold",
    reasonOf(decide(lead({ heldAt: ago(DAY), smsOptIn: false }), conv(), share(), run())) === "opt_out",
  )
  check(
    "supersession outranks On Hold",
    reasonOf(decide(lead({ heldAt: ago(DAY) }), conv(), share({ sentAt: ago(HOUR) }), run())) === "sequence_superseded",
  )
  check(
    "a reply still cancels a full-gated step that is otherwise sendable",
    reasonOf(decide(lead(), conv({ lastInboundAt: ago(MIN) }), share(), run())) === "client_replied",
  )
  check(
    "handoff outranks the reply-cancel (a human is mid-conversation)",
    reasonOf(decide(lead(), conv({ lastInboundAt: ago(MIN), lastManualOutboundAt: ago(MIN) }), share(), run())) === "manual_conversation",
  )


  // ─── 4/5. SEQUENCE PRODUCERS ────────────────────────────────────────────────
  async function producerTests() {
    const NOWD = NOW
    const seed = (over: Partial<SeedLead> = {}): SeedLead =>
      ({
        id: 1,
        first_name: "Sarah",
        phone: "(210) 555-1234",
        beds: "1",
        property_type: null,
        move_date: "2026-10-01",
        crm_status: "new",
        sms_opt_in: true,
        held_at: null,
        followup_opt_in: true,
        followup_enrolled_at: ago(DAY),
        applied_at: null,
        created_at: ago(30 * MIN),
        owner_user_id: "owner-1",
        workspace_id: "ws-1",
        agentFirstName: "Jay",
        timeZone: "America/Chicago",
        accountAuthorized: true,
        ...(over as object),
      }) as SeedLead

    const freshStore = (lead: SeedLead, share: Partial<ShareSnapshot> = {}) => {
      const st = new InMemoryFollowupStore(() => NOWD)
      st.putLead(lead)
      if (Object.keys(share).length) st.setShare(lead.id, share)
      return st
    }

    console.log("\n4/5. Sequence producers — each enrolls EXACTLY once")
    // The producers that were missing entirely. Each is keyed off the durable event
    // verified to exist: shares.sent_at / done_selecting_at / resumed_at and
    // leads.applied_at.
    const cases: Array<[string, SeedLead, Partial<ShareSnapshot>, string, string]> = [
      ["new_lead", seed(), {}, "new_lead", "t1"],
      ["list_sent", seed(), { sentAt: ago(2 * DAY) }, "list_sent", "fu1"],
      ["done_selecting", seed(), { sentAt: ago(3 * DAY), doneSelectingAt: ago(HOUR) }, "done_selecting", "evaluate"],
      ["application_status", seed({ applied_at: ago(4 * DAY) }), { sentAt: ago(6 * DAY) }, "application_status", "ask"],
    ]
    for (const [label, lead, share, expectSeq, expectStep] of cases) {
      const st = freshStore(lead, share)
      const first = await enrollLifecycleRuns(st, NOWD)
      const second = await enrollLifecycleRuns(st, NOWD)
      const third = await enrollLifecycleRuns(st, NOWD)
      const run = st.activeRunForLead(lead.id)
      check(`${label} enrolls on the first pass`, first === 1, `got ${first}`)
      check(`${label} does NOT re-enroll`, second === 0 && third === 0, `got ${second}/${third}`)
      check(`${label} → ${expectSeq}.${expectStep}`, run?.sequence_key === expectSeq && run?.step_key === expectStep, JSON.stringify({ s: run?.sequence_key, k: run?.step_key }))
    }

    console.log("\n  resume_search — event-triggered, keyed on shares.resumed_at")
    {
      const lead = seed()
      const st = freshStore(lead, { sentAt: ago(10 * DAY), disabledAt: ago(5 * DAY), resumedAt: ago(10 * MIN) } as Partial<ShareSnapshot>)
      const first = await enrollResumeSearchRuns(st, NOWD)
      const second = await enrollResumeSearchRuns(st, NOWD)
      check("resume_search enrolls once", first === 1, `got ${first}`)
      check("…and not twice for the same resume", second === 0, `got ${second}`)
      // The guard that actually matters, and which the active-run uniqueness index
      // CANNOT provide: that index only covers status in ('waiting','due'), so once
      // this run completes the index stops blocking a second one. sessionRunExists
      // is status-agnostic precisely for this case — the resume already happened.
      const runsNow = [...(st as unknown as { runs: Map<string, Record<string, unknown>> }).runs.values()]
      for (const r of runsNow) if (r.sequence_key === "resume_search") r.status = "completed"
      const afterCompletion = await enrollResumeSearchRuns(st, NOWD)
      check("…and not again after the run COMPLETED", afterCompletion === 0, `got ${afterCompletion}`)
      const runs = [...(st as unknown as { runs: Map<string, Record<string, unknown>> }).runs.values()]
      const rs = runs.find((r) => r.sequence_key === "resume_search")
      check("resume_search uses session_date (the only coexistence the model allows)", !!rs?.session_date, String(rs?.session_date))
    }
    {
      // No resume event → no run. Proves it is event-keyed, not stage-derived.
      const st = freshStore(seed(), { sentAt: ago(10 * DAY) })
      check("no resumed_at → resume_search never enrolls", (await enrollResumeSearchRuns(st, NOWD)) === 0)
    }

    console.log("\n1. new_lead is superseded when List Sent becomes current")
    {
      const lead = seed()
      const st = freshStore(lead)
      await enrollLifecycleRuns(st, NOWD)
      const before = st.activeRunForLead(lead.id)
      check("starts on new_lead", before?.sequence_key === "new_lead")

      // The locator sends the list — the durable event.
      st.setShare(lead.id, { sentAt: ago(2 * DAY) })
      const created = await enrollLifecycleRuns(st, NOWD)
      const after = st.activeRunForLead(lead.id)
      check("the new_lead run is retired and list_sent created", created === 1 && after?.sequence_key === "list_sent", JSON.stringify({ created, s: after?.sequence_key }))
      const all = [...(st as unknown as { runs: Map<string, Record<string, unknown>> }).runs.values()]
      const old = all.find((r) => r.sequence_key === "new_lead")
      check("…the old run is marked superseded, not left waiting", old?.status === "superseded", String(old?.status))
      check("…with stop_reason sequence_superseded", (old as { stop_reason?: string }).stop_reason === "sequence_superseded")
      check("only ONE active lifecycle run remains", all.filter((r) => ["waiting", "due"].includes(String(r.status)) && !r.session_date).length === 1)
    }

    console.log("\n7/8. On Hold never produces an outbound intent")
    {
      const lead = seed({ held_at: ago(DAY), created_at: ago(30 * MIN) })
      const st = freshStore(lead)
      await enrollLifecycleRuns(st, NOWD)
      check("an On Hold lead still gets a RUN (workflow truth is preserved)", !!st.activeRunForLead(lead.id))
      // Advance past t1's eligibility and tick: the gate must hold, not enqueue.
      const st2 = new InMemoryFollowupStore(() => new Date(NOWD.getTime() + 10 * MIN))
      st2.putLead(lead)
      await enrollLifecycleRuns(st2, new Date(NOWD.getTime() + 10 * MIN))
      const summary = await tick(st2, new Date(NOWD.getTime() + 10 * MIN))
      check("…but NO intent is ever enqueued while On Hold", st2.intentsForLead(lead.id).length === 0, JSON.stringify(summary))
      check("…and the run is held, not cancelled", ["waiting", "due"].includes(String(st2.activeRunForLead(lead.id)?.status)))
    }
    {
      // Resume = clear held_at. The run re-evaluates from CURRENT state; there is no
      // queue of stale intents to flush, because none were ever created.
      const lead = seed({ held_at: ago(10 * DAY), created_at: ago(9 * DAY) })
      const later = new Date(NOWD.getTime() + 20 * MIN)
      const st = new InMemoryFollowupStore(() => later)
      st.putLead(lead)
      st.setShare(lead.id, { sentAt: ago(8 * DAY) })
      await enrollLifecycleRuns(st, later)
      await tick(st, later)
      check("while held, nothing queued", st.intentsForLead(lead.id).length === 0)
      st.patchLead(lead.id, { held_at: null })
      await tick(st, later)
      check("on resume, at most ONE fresh intent (no burst)", st.intentsForLead(lead.id).length <= 1, String(st.intentsForLead(lead.id).length))
    }

    console.log("\n13/14. Blast radius")
    {
      // VERIFICATION 13. A lead going On Hold must not disturb the locator's task
      // list. The engine has exactly one edge into lead_next_actions —
      // suppressManualTourFollowUp, which completes an open `tour_follow_up` when a
      // post_tour run is created — so that open task is the thing to watch.
      const lead = seed({ held_at: ago(DAY) })
      const st = freshStore(lead)
      st.setManualTourFollowUp(lead.id, true)
      check("the locator's tour_follow_up task starts open", st.hasManualTourFollowUp(lead.id) === true)
      await enrollLifecycleRuns(st, NOWD)
      await tick(st, NOWD)
      check(
        "On Hold leaves the locator's tour_follow_up task untouched",
        st.hasManualTourFollowUp(lead.id) === true,
      )
      check("…and queued no client text", st.intentsForLead(lead.id).length === 0)
    }
    {
      // No second sender: nothing outside lib/followup may enqueue an intent, and the
      // retired 3-day cron must not have gained a send.
      const cron = readFileSync("app/api/cron/send-3day-followups/route.ts", "utf8")
      // The retirement note quotes the old TODO deliberately, so match a STANDALONE
    // TODO line rather than the phrase appearing anywhere in prose.
    check("the 3-day cron no longer has a standalone send TODO", !/^\s*\/\/ Later: send SMS here/m.test(cron))
    check("…and contains no send call of any kind", !/messages\.create|twilio|sendNotification|fetch\(/i.test(cron))
      check("…and performs no database read at all", !/from\("leads"\)/.test(cron))
      check("…and is retired with 410", /status: 410/.test(cron))
      const vercel = readFileSync("vercel.json", "utf8")
      check("…and its cron schedule is removed", !/send-3day-followups/.test(vercel))
      check("the canonical engine cron remains", /followup-tick/.test(vercel))
    }
  }

  await producerTests()

  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
