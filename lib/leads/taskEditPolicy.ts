/**
 * WHAT MAY BE CHANGED ON AN EXISTING NEXT ACTION — the one place that decides.
 *
 * Two kinds of row live in lead_next_actions and they are not equally editable:
 *
 *   MANUAL tasks (action_key null / action_type "manual") are the locator's own. Title, due date
 *   and notes are all theirs to change.
 *
 *   WORKFLOW actions (setup_tour, check_application, follow_up_1 …) carry the workflow's identity.
 *   Only their SCHEDULE may move. Renaming one is what the Ready-to-Tour audit showed to be
 *   actively destructive: rankLeadActions suppresses the computed stage action by matching its
 *   TITLE, so a renamed setup_tour stops matching, the automatic Schedule Tour resurrects as a
 *   duplicate and goes permanently overdue — and completing the renamed row then flips
 *   isTourScheduled true with no tour in lead_tours, which the UI offers no way back from.
 *
 * This module is PURE so the rule can be tested without a database, and the API route is the only
 * writer — the Companion cannot reach the table directly, so disabling an input is a courtesy,
 * never the control.
 */

/** The fields a caller may ask to change. Anything absent is left exactly as it was. */
export type TaskEditRequest = {
  title?: string | null
  dueAt?: string | null
  notes?: string | null
}

/** The row as stored, reduced to what the decision needs. */
export type TaskRow = {
  id: number | string
  action_key: string | null
  action_type: string | null
  completed: boolean | null
  status: string | null
}

export type TaskEditDecision =
  | { ok: true; patch: { title?: string; due_at?: string; notes?: string | null } }
  | { ok: false; reason: TaskEditRefusal; message: string }

export type TaskEditRefusal =
  | "not_open"
  | "rename_workflow_action"
  | "nothing_to_change"
  | "invalid_due_at"
  | "empty_title"

/** A workflow action owns its identity; a manual task does not. */
export function isWorkflowAction(row: Pick<TaskRow, "action_key" | "action_type">): boolean {
  const key = (row.action_key ?? "").trim()
  if (key !== "") return true
  // action_type is the secondary signal: createManualTask stamps "manual"/"custom" explicitly, so
  // anything that is NOT manual with no key is treated as workflow-owned — fail closed.
  const type = (row.action_type ?? "").trim().toLowerCase()
  return type !== "" && type !== "manual"
}

/** Only an OPEN row may be edited. A completed or canceled action is history. */
export function isOpen(row: Pick<TaskRow, "completed" | "status">): boolean {
  const status = (row.status ?? "").trim().toLowerCase()
  return row.completed !== true && status !== "completed" && status !== "canceled"
}

/**
 * The patch to apply, or the refusal.
 *
 * NOTHING outside title/due_at/notes can be produced here, by construction — action_key,
 * completed, completed_at, status, property_id, lead_id and every leads column are unreachable
 * from this function's return type, so no caller can be talked into writing them.
 */
export function decideTaskEdit(row: TaskRow, req: TaskEditRequest): TaskEditDecision {
  if (!isOpen(row)) {
    return { ok: false, reason: "not_open", message: "That task is already completed or canceled." }
  }

  const patch: { title?: string; due_at?: string; notes?: string | null } = {}

  if (req.dueAt !== undefined && req.dueAt !== null) {
    const d = new Date(req.dueAt)
    if (Number.isNaN(d.getTime())) {
      return { ok: false, reason: "invalid_due_at", message: "That due date isn't a valid date and time." }
    }
    patch.due_at = d.toISOString()
  }

  if (req.title !== undefined && req.title !== null) {
    const title = req.title.trim()
    if (isWorkflowAction(row)) {
      // Refused, not silently dropped: a caller that believes it renamed the action and finds the
      // old name later would have no way to tell which of the two is true.
      return {
        ok: false,
        reason: "rename_workflow_action",
        message: "This is an automatic workflow action — its schedule can move, but its name cannot change.",
      }
    }
    if (!title) {
      return { ok: false, reason: "empty_title", message: "A task needs a title." }
    }
    patch.title = title
  }

  // notes: undefined means "leave it alone"; null or "" means "clear it". Only an explicit value
  // touches the column, so an edit that moves a date can never wipe notes written elsewhere.
  if (req.notes !== undefined) {
    patch.notes = req.notes === null ? null : (req.notes.trim() || null)
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, reason: "nothing_to_change", message: "Nothing was changed." }
  }
  return { ok: true, patch }
}
