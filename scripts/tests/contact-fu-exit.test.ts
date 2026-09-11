/**
 * Contact FU chase EXIT proofs (pure logic, no DB).
 *   - reached mid-chase: canceled Contact FU is not surfaced; Build List wins.
 *   - FU3 terminal → ghosted archive; an archived lead never falls back to Build List.
 *
 *   npx tsx scripts/tests/contact-fu-exit.test.ts
 */
import { rankLeadActions } from "../../lib/nextActions"
import { getNextAction } from "../../lib/nextAction"
import { getNextContactFollowUpAction } from "../../lib/workflowEngine"

let failures = 0
function ok(c: boolean, m: string) { if (!c) { failures++; console.error("✗", m) } else console.log("✓", m) }

const row = (over: Record<string, unknown>) => ({
  id: 10, lead_id: 1, title: "", due_at: new Date(Date.now() + 2 * 864e5).toISOString(),
  priority: "medium" as const, completed: false, completed_at: null, notes: null, created_at: new Date().toISOString(), ...over,
})

// Reached mid-chase: the Contact FU is CANCELED, Build List is open → Build List wins,
// canceled FU never appears as primary or in others.
{
  const lead = { id: 1, crm_status: "contacted", next_action_date: null, follow_up_count: 0 }
  const actions = [
    row({ id: 11, title: "Contact FU2", action_key: "contact_follow_up_2", status: "canceled" }),
    row({ id: 12, title: "Build List", action_key: "build_list", status: "open" }),
  ]
  const { primary, others } = rankLeadActions(lead, actions as any, getNextAction(lead))
  ok(primary.title === "Build List", "reached mid-chase: primary = Build List")
  ok(!others.some((o) => o.title === "Contact FU2") && primary.title !== "Contact FU2", "canceled Contact FU is not surfaced")
}

// FU3 is terminal (no successor).
ok(getNextContactFollowUpAction("Contact FU3") === null, "Contact FU3 → no successor (terminal)")

// Archived ghosted lead: the ranker must NOT fall back to the stage's Build List.
{
  const lead = { id: 1, crm_status: "archived", next_action_date: null, follow_up_count: 0 }
  ok(getNextAction(lead) === "Next Action", "getNextAction('archived') === 'Next Action' (no Build List)")
  // Even with a stale open Build List row present, the archived branch short-circuits.
  const { primary, others } = rankLeadActions(lead, [row({ id: 13, title: "Build List", action_key: "build_list" })] as any, getNextAction(lead))
  ok(primary.title === "Next Action", "archived lead → primary sentinel 'Next Action' (never Build List)")
  ok(others.length === 0, "archived lead → no other actions surfaced")
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
