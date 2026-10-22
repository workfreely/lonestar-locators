import { NextResponse } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { createClient } from "@/lib/supabase/server"
import { decideTaskEdit, type TaskRow } from "@/lib/leads/taskEditPolicy"

/**
 * EDIT ONE EXISTING NEXT ACTION — the only writer for a task edit.
 *
 * WHY A ROUTE AND NOT A SUPABASE CALL FROM THE PANEL. Every other task write in this codebase
 * goes straight from the browser through RLS, and RLS is the right tool for "is this your lead?".
 * It is the wrong tool for "may this particular row be renamed?", which depends on the row's
 * workflow identity rather than on who is asking. Putting that rule in the client would mean the
 * Companion — an extension, the least trustworthy surface here — was the thing enforcing it.
 * So the decision lives in lib/leads/taskEditPolicy and runs here, and a disabled input is only
 * ever a courtesy to the person using it.
 *
 * The session's workspace is resolved from the cookie and the row is re-read and re-checked
 * against it, so a leadId or task id from the message bus can never reach another tenant's data.
 */
export const runtime = "nodejs"

export async function PATCH(request: Request) {
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const taskId = body?.taskId
  if (taskId === undefined || taskId === null || taskId === "") {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 })
  }

  const supabase = await createClient()

  // Re-read the row under the CALLER'S session. RLS already scopes lead_next_actions to their
  // workspace, and the explicit workspace comparison below is the second lock: a row that somehow
  // reads through must still belong to the session's workspace to be written.
  const { data: row, error: readErr } = await supabase
    .from("lead_next_actions")
    .select("id, lead_id, title, action_key, action_type, completed, status, notes, due_at")
    .eq("id", taskId)
    .maybeSingle()

  if (readErr) return NextResponse.json({ error: "Could not load that task." }, { status: 500 })
  if (!row) return NextResponse.json({ error: "Task not found." }, { status: 404 })

  const { data: leadRow } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .eq("id", row.lead_id)
    .maybeSingle()
  if (!leadRow || leadRow.workspace_id !== guard.workspaceId) {
    // 404, not 403: a task in someone else's workspace should not be distinguishable from one
    // that does not exist.
    return NextResponse.json({ error: "Task not found." }, { status: 404 })
  }

  const decision = decideTaskEdit(row as TaskRow, {
    title: body.title as string | null | undefined,
    dueAt: body.dueAt as string | null | undefined,
    notes: body.notes as string | null | undefined,
  })
  if (!decision.ok) {
    // 409 for "this row does not allow that", 400 for a malformed request.
    const status = decision.reason === "invalid_due_at" || decision.reason === "empty_title" ? 400 : 409
    return NextResponse.json({ error: decision.message, reason: decision.reason }, { status })
  }

  const { data: updated, error: writeErr } = await supabase
    .from("lead_next_actions")
    .update(decision.patch)
    .eq("id", row.id)
    // Belt and braces on the write itself: an action that was completed between the read and the
    // write must not be edited, and this makes that a database condition rather than a race.
    .eq("completed", false)
    .select("*")
    .maybeSingle()

  if (writeErr) return NextResponse.json({ error: "Could not save that change." }, { status: 500 })
  if (!updated) return NextResponse.json({ error: "That task is no longer open.", reason: "not_open" }, { status: 409 })

  return NextResponse.json({ success: true, task: updated })
}
