/**
 * Contacted-semantics ranker proofs (pure logic, no DB).
 *
 * Verifies that once an UNANSWERED attempt advances a lead to Contacted, the
 * open Contact FU is the Next Action — the stage's automatic "Build List" is
 * suppressed — while a REACHED lead (open build_list row) still shows Build List.
 *
 *   npx tsx scripts/tests/contacted-semantics.test.ts
 */
import { rankLeadActions } from "../../lib/nextActions"
import { getNextAction } from "../../lib/nextAction"

let failures = 0
function ok(c: boolean, m: string) { if (!c) { failures++; console.error("✗", m) } else console.log("✓", m) }

const base = (over: Record<string, unknown> = {}) => ({ id: 1, crm_status: "contacted", next_action_date: null, follow_up_count: 0, ...over })
const row = (over: Record<string, unknown>) => ({
  id: 10, lead_id: 1, title: "", due_at: new Date(Date.now() + 2 * 864e5).toISOString(),
  priority: "medium" as const, completed: false, completed_at: null, notes: null, created_at: new Date().toISOString(), ...over,
})

// getNextAction still says "Build List" for the contacted stage (unchanged).
ok(getNextAction(base()) === "Build List", "getNextAction('contacted') === 'Build List' (stage rule unchanged)")

// Attempted → Contacted with an open Contact FU1: primary is the Contact FU, NOT Build List.
{
  const lead = base()
  const actions = [row({ id: 11, title: "Contact FU1", action_key: "contact_follow_up_1" })]
  const { primary, others } = rankLeadActions(lead, actions as any, getNextAction(lead))
  ok(primary.title === "Contact FU1", "Contacted + open Contact FU1 → primary Contact FU1")
  ok(!others.some((o) => o.title === "Build List") && primary.title !== "Build List", "automatic Build List suppressed for the contact chase")
}
// Same for FU2/FU3.
for (const [k, t] of [["contact_follow_up_2", "Contact FU2"], ["contact_follow_up_3", "Contact FU3"]] as const) {
  const lead = base()
  const { primary } = rankLeadActions(lead, [row({ id: 12, title: t, action_key: k })] as any, getNextAction(lead))
  ok(primary.title === t, `Contacted + open ${t} → primary ${t} (Build List suppressed)`)
}

// REACHED → Contacted with an open build_list row: primary is Build List (unchanged path).
{
  const lead = base()
  const actions = [row({ id: 13, title: "Build List", action_key: "build_list" })]
  const { primary } = rankLeadActions(lead, actions as any, getNextAction(lead))
  ok(primary.title === "Build List", "Contacted + open build_list → primary Build List (reached path unchanged)")
}

// A contacted lead with NO open contact FU and NO build_list still surfaces the
// stage automatic (Build List) — post-FU3 / manual cases are unaffected.
{
  const lead = base()
  const { primary } = rankLeadActions(lead, [] as any, getNextAction(lead))
  ok(primary.title === "Build List", "Contacted + no open rows → automatic Build List (unchanged)")
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
