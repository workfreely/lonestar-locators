// Foundation types for the future workflow engine (CRM v1.1.0, workflow
// phase). Mirrors supabase/migrations/20260719010000_add_lead_primary_action.sql.
//
// NOT wired into any UI yet. The Follow-Ups sidebar and Lead Panel keep
// running entirely on the existing lead_next_actions / lib/nextActions.ts
// ranking system (see FollowUpRow.tsx, LeadPanel.tsx) — this file exists
// so a future workflow engine has a data shape and a status rule ready to
// build on, without this phase deciding how leads actually move through
// it. Do not import PrimaryAction or isPrimaryActionDue into FollowUpRow
// or LeadPanel as part of this phase.

export type PrimaryActionStatus = "due" | "scheduled" | "waiting" | "completed"

export type PrimaryAction = {
  id: number
  lead_id: number
  // Free text, not a fixed enum — the real set of workflow steps (Send
  // Apartment List, Setup Tour, Confirm Application, ...) isn't decided
  // yet, and constraining it here would bake in an assumption this phase
  // is explicitly meant to avoid.
  action_type: string
  status: PrimaryActionStatus
  activation_date: string | null
  due_date: string | null
  completed: boolean
  created_at: string
  updated_at: string
}

/**
 * Whether a primary action should surface in the Today work queue: only
 * "due" actions with a due_date of today or earlier. "scheduled" and
 * "waiting" stay hidden regardless of their due_date until a future
 * workflow engine promotes them to "due".
 */
export function isPrimaryActionDue(action: Pick<PrimaryAction, "status" | "due_date">): boolean {
  if (action.status !== "due") return false
  if (!action.due_date) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(action.due_date)
  due.setHours(0, 0, 0, 0)
  return due.getTime() <= today.getTime()
}

/**
 * Whether a "due" primary action is specifically overdue (due_date
 * strictly before today), as distinct from due today.
 */
export function isPrimaryActionOverdue(action: Pick<PrimaryAction, "status" | "due_date">): boolean {
  if (action.status !== "due") return false
  if (!action.due_date) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(action.due_date)
  due.setHours(0, 0, 0, 0)
  return due.getTime() < today.getTime()
}
