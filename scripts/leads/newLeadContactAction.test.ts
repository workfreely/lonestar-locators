/**
 * New-lead canonical Contact Lead: due-date + RLS-visible ownership.
 *
 * Proves the two-part fix so a newly created actionable lead reliably appears in
 * Agenda → Today regardless of ingestion source:
 *   1. A new lead's canonical action is `contact_lead`.
 *   2. Its due date is the CURRENT local calendar day (autoDueInDays(0)), in the
 *      workspace timezone — so it lands in Today, not tomorrow.
 *   3/4. createWorkflowActionIfNeeded stamps the row's workspace_id + owner_user_id
 *      from the PARENT LEAD (not auth.uid()), so the row is RLS-visible — this is
 *      what a service-role/server ingestion needs to not land a NULL-workspace row.
 *   5. Same-day contact_lead → urgency "today".
 *   6. Previous-day incomplete contact_lead → urgency "overdue".
 *   7. Completed contact_lead is excluded from the due queue (urgency "none").
 *   8. No duplicate contact_lead is created when an open one already exists.
 *   9. Service-role init (no auth.uid()) still produces a correctly-owned row.
 *  10. Source never changes Agenda eligibility (ranking ignores lead.source).
 *  11. Other workflow stages keep their existing +1-day backstop (unchanged).
 *
 *   npx tsx scripts/leads/newLeadContactAction.test.ts
 */
import { getStageWorkflowAction, createWorkflowActionIfNeeded } from "@/lib/workflowEngine"
import { autoDueInDays } from "@/lib/workflow/autoDueDate"
import { rankLeadActions } from "@/lib/nextActions"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (a === b) pass++
  else { fail++; console.error("✗", name, `\n   got:  ${JSON.stringify(a)}\n   want: ${JSON.stringify(b)}`) }
}
const ok = (c: boolean, name: string) => { if (c) pass++; else { fail++; console.error("✗", name) } }

const TZ = "America/Chicago"

// ── Minimal mock Supabase client capturing the insert payload ────────────────
type Store = { lead: any; existing: any[]; inserted: any[] }
function mockClient(store: Store): any {
  return {
    from(table: string) {
      const b: any = { _table: table, _op: "select", _rows: null }
      b.select = () => b
      b.eq = () => b
      b.insert = (rows: any[]) => { b._op = "insert"; b._rows = rows; store.inserted.push(...rows); return b }
      // Terminal calls resolve based on table + op.
      b.limit = () => Promise.resolve({ data: store.existing, error: null }) // dedup check
      b.single = () => {
        if (b._op === "insert") return Promise.resolve({ data: { id: 999, ...b._rows[0] }, error: null })
        if (b._table === "leads") return Promise.resolve({ data: store.lead, error: null }) // ownership lookup
        return Promise.resolve({ data: null, error: null })
      }
      return b
    },
  }
}

// Local 9:00 AM on the given epoch, as an ISO instant (runtime-local — matches urgencyOf).
const at9 = (ms: number) => { const x = new Date(ms); x.setHours(9, 0, 0, 0); return x.toISOString() }
const todayLocalDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d)

async function run() {
  // 1. New lead → contact_lead
  const spec = getStageWorkflowAction("new", { follow_up_count: 0, move_date: null }, TZ)
  ok(!!spec && spec.actionKey === "contact_lead" && spec.title === "Contact Lead", "1. new lead → contact_lead action")

  // 2. Due date = current local calendar day (workspace tz) and uses autoDueInDays(0)
  eq(todayLocalDate(new Date(spec!.dueAt)), todayLocalDate(new Date()), "2a. contact_lead due date = today (workspace tz)")
  eq(spec!.dueAt, autoDueInDays(0, TZ), "2b. new-lead dueAt uses autoDueInDays(0)")

  // 3/4/9. Ownership stamped from the parent lead (service-role: no auth.uid() involved)
  const store: Store = { lead: { workspace_id: "WS-1", owner_user_id: "U-1" }, existing: [], inserted: [] }
  const created = await createWorkflowActionIfNeeded(mockClient(store), 123, spec!)
  ok(!!created, "3a. action created")
  eq(store.inserted.length, 1, "3b. exactly one insert")
  eq(store.inserted[0]?.workspace_id, "WS-1", "3. action receives parent lead workspace_id")
  eq(store.inserted[0]?.owner_user_id, "U-1", "4. action receives parent lead owner_user_id")
  eq(store.inserted[0]?.action_key, "contact_lead", "9a. row is the canonical contact_lead")
  ok(store.inserted[0]?.workspace_id != null && store.inserted[0]?.owner_user_id != null, "9. service-role init → non-null owned (RLS-visible) row")

  // 8. No duplicate when an open contact_lead already exists
  const dupStore: Store = { lead: { workspace_id: "WS-1", owner_user_id: "U-1" }, existing: [{ id: 1 }], inserted: [] }
  const dupResult = await createWorkflowActionIfNeeded(mockClient(dupStore), 123, spec!)
  eq(dupResult, null, "8a. dedup returns null when an open contact_lead exists")
  eq(dupStore.inserted.length, 0, "8b. dedup inserts nothing")

  // 5/6/7. Day-level urgency through the public ranking API
  const lead = { id: 1, crm_status: "new", next_action_date: null }
  const row = (over: Record<string, unknown>) => ({
    lead_id: 1, title: "Contact Lead", action_key: "contact_lead", action_type: "workflow",
    priority: "medium", completed: false, status: "open", due_at: at9(Date.now()), ...over,
  })
  eq(rankLeadActions(lead, [row({})], "Contact Lead").primary.urgency, "today", "5. same-day contact_lead → today")
  eq(rankLeadActions(lead, [row({})], "Contact Lead").primary.title, "Contact Lead", "5b. persisted contact_lead is primary")
  eq(rankLeadActions(lead, [row({ due_at: at9(Date.now() - 86_400_000) })], "Contact Lead").primary.urgency, "overdue", "6. previous-day contact_lead → overdue")
  eq(rankLeadActions(lead, [row({ completed: true })], "Contact Lead").primary.urgency, "none", "7. completed contact_lead excluded (urgency none)")

  // 10. Source does not alter Agenda eligibility (ranking never reads lead.source)
  const rowToday = row({ lead_id: 2 })
  const p1 = rankLeadActions({ id: 2, crm_status: "new", next_action_date: null, source: "Lone Star Website" }, [rowToday], "Contact Lead").primary
  const p2 = rankLeadActions({ id: 2, crm_status: "new", next_action_date: null, source: "Manual" }, [rowToday], "Contact Lead").primary
  eq(p1.urgency, p2.urgency, "10a. source does not change urgency")
  eq(p1.title, p2.title, "10b. source does not change primary title")

  // 11. Other workflow stages keep their existing +1-day backstop
  eq(getStageWorkflowAction("contacted", { follow_up_count: 0 }, TZ)?.dueAt, autoDueInDays(1, TZ), "11a. contacted→build_list still +1 day")
  eq(getStageWorkflowAction("searching", {}, TZ)?.dueAt, autoDueInDays(1, TZ), "11b. searching→send_list still +1 day")

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

run()
