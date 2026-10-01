/**
 * LEAD ACTION HISTORY — the Ka'Leah Davis (lead 84) regression.
 *
 * SYMPTOM: Beast Companion showed two different action histories on consecutive
 * refreshes — "1st Follow-Up / 2nd Follow-Up", then "Lead Created / Schedule Tour".
 *
 * TWO independent causes, both covered here:
 *   1. Completing a post-List-Sent follow-up looked its row up in CLIENT React
 *      state and silently skipped the database write when absent, while still
 *      incrementing follow_up_count and creating the successor. It then fabricated
 *      an unpersisted "completed" row in local state so the label looked right
 *      until the state was rebuilt.
 *   2. The page shipped ONLY open rows (`.eq("completed", false)`), so
 *      deriveLastAction — which exists solely to read completed rows — could never
 *      find a candidate after a reload and always fell back to "Lead Created".
 *
 * Cause 2 is the one that matters most: without it, fixing cause 1 still leaves
 * the Companion showing "Lead Created" forever.
 *
 * Run: npx tsx scripts/tests/leadActionHistory.test.ts
 */
import { readFileSync } from "node:fs"
import { buildActiveClientPayload } from "../../lib/companion/leadToDto"
import { completedPatch, LIST_LADDER_ACTION_KEYS, STAGES_PAST_LIST_LADDER } from "../../lib/leads/actionCompletion"
import { CONTACT_CHASE_ACTION_KEYS, STAGES_PAST_CONTACT_CHASE } from "../../lib/leads/contactChase"

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

// ── Ka'Leah Davis, lead 84, exactly as production holds her ─────────────────
const SENT_AT = "2026-10-01T22:26:54.923+00:00" // her lead_timeline text_sent
const kaleah = (over: Record<string, unknown> = {}) => ({
  id: 84,
  first_name: "Ka'Leah",
  last_name: "Davis",
  phone: "(210) 555-0100",
  crm_status: "ready_to_tour",
  follow_up_count: 1,
  next_action_date: "2026-10-02T14:00:00+00:00",
  first_text_sent_at: null,
  created_at: "2026-09-30T12:05:29.443844+00:00",
  held_at: null,
  deleted_at: null,
  ...over,
})

/** Her six rows. `fu1Done` models the state AFTER the completion fix. */
const actions = (fu1Done: boolean) => [
  { id: 98, lead_id: 84, action_key: "contact_lead", title: "Contact Lead", status: "canceled", completed: false, completed_at: null, due_at: "2026-09-30T14:00:00+00:00" },
  { id: 99, lead_id: 84, action_key: "contact_follow_up_1", title: "Contact FU1", status: "canceled", completed: false, completed_at: null, due_at: "2026-10-02T14:00:00+00:00" },
  { id: 100, lead_id: 84, action_key: "send_list", title: "Send List", status: "open", completed: false, completed_at: null, due_at: "2026-10-01T14:00:00+00:00" },
  fu1Done
    ? { id: 101, lead_id: 84, action_key: "follow_up_1", title: "FU1", ...completedPatch(SENT_AT), due_at: "2026-10-01T14:00:00+00:00" }
    : { id: 101, lead_id: 84, action_key: "follow_up_1", title: "FU1", status: "open", completed: false, completed_at: null, due_at: "2026-10-01T14:00:00+00:00" },
  { id: 104, lead_id: 84, action_key: "follow_up_2", title: "FU2", status: "open", completed: false, completed_at: null, due_at: "2026-10-04T14:00:00+00:00" },
  { id: 105, lead_id: 84, action_key: "setup_tour", title: "Setup Tour", status: "open", completed: false, completed_at: null, due_at: "2026-10-01T22:27:05+00:00" },
]

/** What the stage-transition stand-down now does, applied to a row set. */
const applyStandDown = (rows: ReturnType<typeof actions>, stage: string) =>
  rows.map((r) =>
    STAGES_PAST_LIST_LADDER.has(stage) &&
    r.status === "open" &&
    r.completed === false &&
    (LIST_LADDER_ACTION_KEYS as readonly string[]).includes(String(r.action_key))
      ? { ...r, status: "canceled" }
      : r,
  )

const dtoFor = (lead: Record<string, unknown>, rows: unknown[]) =>
  buildActiveClientPayload(lead, rows as never[], "Jay", null, "America/Chicago")

console.log("\nLEAD ACTION HISTORY\n")

// ─── Ka'Leah's expected final state ────────────────────────────────────────
console.log("Ka'Leah's expected final state (stage + Last + Next)")
{
  const rows = applyStandDown(actions(true), "ready_to_tour")
  const p = dtoFor(kaleah(), rows)
  check("Stage: Ready to Tour", p.lead.stage === "ready_to_tour", String(p.lead.stage))
  check("Last Action resolves to the real completed FU1", p.lead.lastAction?.title === "FU1", JSON.stringify(p.lead.lastAction))
  check("…timestamped from the actual send, not 'now'", p.lead.lastAction?.completedAt === SENT_AT, String(p.lead.lastAction?.completedAt))
  check("…NOT the Lead Created fallback", p.lead.lastAction?.title !== "Lead Created")
  const next = (p.nextActions ?? []).find((a) => !a.completed)
  check("Next Action is Schedule Tour", /setup tour|schedule tour/i.test(String(next?.title)), JSON.stringify(next))
  check("no guest card is required to reach this state", !(p.nextActions ?? []).some((a) => /guest card/i.test(String(a.title))))
}

// ─── Cause 2 — completed rows must reach the client ────────────────────────
console.log("\nCause 2 — a completed row must survive a reload to be readable")
{
  // The OLD props behaviour: open rows only. This is what produced "Lead Created"
  // on every reload regardless of the database.
  const openOnly = applyStandDown(actions(true), "ready_to_tour").filter((r) => r.completed === false)
  const p = dtoFor(kaleah(), openOnly)
  check(
    "with completed rows stripped, Last Action IS the fallback (proves the props fix is load-bearing)",
    p.lead.lastAction?.title === "Lead Created",
    JSON.stringify(p.lead.lastAction),
  )
}
{
  const src = readFileSync("app/admin/leads/page.tsx", "utf8")
  // Must match a CHAINED CALL, not the phrase — the replacement comment quotes the
  // old code deliberately, and a bare substring test flagged that quote.
  check("the page no longer filters completed rows out", !/^\s*\.eq\("completed", false\)/m.test(src))
  check("…it includes recently-completed ones", /completed_at\.gte\./.test(src))
  check("…and orders with an id tiebreaker (due_at ties constantly)", /\.order\("id", \{ ascending: true \}\)/.test(src))
}

// ─── Cause 1 — completion is durable and server-resolved ───────────────────
console.log("\nCause 1 — completion is persisted, never synthesised")
{
  const src = readFileSync("components/crm/DashboardClient.tsx", "utf8")
  check("the synthetic client-only completed row is gone", !/local-fu-\$\{/.test(src))
  check("…and nothing references it", !/completedFollowLocal/.test(src))
}
{
  const src = readFileSync("lib/leads/followUpWorkflow.ts", "utf8")
  check("completion no longer depends on the client having the row", !/if \(!isDemoLeadId\(lead\.id\) && followRow\?\.id != null\)/.test(src))
  check("…it resolves the open row server-side when absent", /resolveOpenActionId\(supabase, lead\.id/.test(src))
  check("…and reports a miss instead of skipping silently", /no open row found to complete/.test(src))
  check("…via the canonical helper", /completeAction\(supabase, rowId, now\)/.test(src))
}
check(
  "completedPatch always writes all THREE columns",
  (() => {
    const p = completedPatch("2026-10-01T00:00:00.000Z") as Record<string, unknown>
    return p.completed === true && p.status === "completed" && p.completed_at === "2026-10-01T00:00:00.000Z"
  })(),
)
check(
  "a row completed via completedPatch is seen as done by BOTH reader tests",
  (() => {
    const r = completedPatch() as { completed: boolean; status: string }
    // Readers use `completed === true || status === "completed"`; status-filtered
    // queries (the stand-downs) use status. Both must agree.
    return (r.completed === true || r.status === "completed") && r.status === "completed"
  })(),
)

// ─── Stage transition retires the List Sent ladder ─────────────────────────
console.log("\nMoving to Ready to Tour retires the List Sent ladder")
{
  const before = actions(true)
  const after = applyStandDown(before, "ready_to_tour")
  const openKeys = (rows: typeof before) => rows.filter((r) => r.status === "open" && !r.completed).map((r) => r.action_key).sort()
  check(
    "before: send_list, follow_up_2 and setup_tour are all open",
    JSON.stringify(openKeys(before)) === JSON.stringify(["follow_up_2", "send_list", "setup_tour"]),
    JSON.stringify(openKeys(before)),
  )
  check("after: only setup_tour remains open", JSON.stringify(openKeys(after)) === JSON.stringify(["setup_tour"]), JSON.stringify(openKeys(after)))
  check("send_list is retired", after.find((r) => r.id === 100)?.status === "canceled")
  check("follow_up_2 is retired", after.find((r) => r.id === 104)?.status === "canceled")
  check("the COMPLETED follow_up_1 is untouched (still completed, not canceled)", after.find((r) => r.id === 101)?.status === "completed")
  check("no duplicate or contradictory open actions remain", openKeys(after).length === 1)
}
check(
  "the ladder key set covers every follow-up step plus send_list",
  JSON.stringify([...LIST_LADDER_ACTION_KEYS].sort()) ===
    JSON.stringify(["final_follow_up", "follow_up_1", "follow_up_2", "follow_up_3", "send_list"]),
)
check("list_sent itself is NOT a stand-down stage (the ladder lives there)", !STAGES_PAST_LIST_LADDER.has("list_sent"))
check("done_touring / applied / closed also retire it", ["done_touring", "applied", "closed"].every((s) => STAGES_PAST_LIST_LADDER.has(s)))
check("a lead still in List Sent keeps its ladder", (() => {
  const after = applyStandDown(actions(true), "list_sent")
  return after.find((r) => r.id === 104)?.status === "open"
})())
{
  const src = readFileSync("app/api/admin/leads/update-stage/route.ts", "utf8")
  check("the route performs the stand-down", /STAGES_PAST_LIST_LADDER\.has\(crm_status\)/.test(src))
  check("…reusing the 'canceled' status, deleting nothing", /\.update\(\{ status: "canceled" \}\)[\s\S]{0,400}LIST_LADDER_ACTION_KEYS/.test(src))
  check("…and returns the ids so the client retires them locally too", /canceledActionIds = \[\.\.\.canceledActionIds/.test(src))
}

// ─── The contact chase must be unchanged ───────────────────────────────────
console.log("\nExisting contact-chase behaviour is unchanged")
check(
  "the two key sets are disjoint",
  !(CONTACT_CHASE_ACTION_KEYS as readonly string[]).some((k) => (LIST_LADDER_ACTION_KEYS as readonly string[]).includes(k)),
  `overlap: ${(CONTACT_CHASE_ACTION_KEYS as readonly string[]).filter((k) => (LIST_LADDER_ACTION_KEYS as readonly string[]).includes(k)).join(", ")}`,
)
check(
  "the chase still stands down at list_sent, where the ladder does NOT",
  STAGES_PAST_CONTACT_CHASE.has("list_sent") && !STAGES_PAST_LIST_LADDER.has("list_sent"),
)
check(
  "the ladder stand-down never touches a contact-chase row",
  (() => {
    const after = applyStandDown(actions(true), "ready_to_tour")
    // 98/99 were already canceled by the chase; they must stay exactly as they were.
    return after.find((r) => r.id === 98)?.status === "canceled" && after.find((r) => r.id === 99)?.status === "canceled"
  })(),
)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
