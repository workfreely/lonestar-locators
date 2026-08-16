import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"

/**
 * CANONICAL manual "Add Task" create — the ONE lead_next_actions insert for a
 * custom task, mirroring the CRM Add Task (LeadPanel.handleCreateAction) exactly:
 * a MANUAL row tagged action_key null / action_type "manual" / origin "custom" /
 * status "open", so it is never mistaken for a workflow action and is exempt from
 * workflow dedup. Demo leads get a local-only row (no DB write). Returns the
 * created row (real or synthesized), or null on error — so the caller can
 * optimistically append it to its next-action state and let the existing ranking
 * (rankLeadActions) reconcile it as the Next Action.
 */
export async function createManualTask(opts: {
  lead: any
  title: string
  dueAt: string // ISO instant
  priority?: "low" | "medium" | "high"
  notes?: string | null
  now: string // single timestamp (for the demo row id)
}): Promise<any | null> {
  const { lead, title, dueAt, priority = "medium", notes = null, now } = opts

  if (isDemoLeadId(lead.id)) {
    return {
      id: `demo-act-${now}`,
      lead_id: lead.id,
      title,
      due_at: dueAt,
      priority,
      notes: notes || null,
      completed: false,
      action_key: null,
      action_type: "manual",
      origin: "custom",
      status: "open",
    }
  }

  const { data, error } = await supabase
    .from("lead_next_actions")
    .insert([{
      lead_id: lead.id,
      title,
      due_at: dueAt,
      priority,
      notes: notes || null,
      action_key: null,
      action_type: "manual",
      origin: "custom",
      status: "open",
    }])
    .select("*")
    .single()

  if (error) {
    console.error("[add-task] create failed:", error)
    return null
  }
  return data
}
