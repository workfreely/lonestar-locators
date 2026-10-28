// Tour Follow-Up workflow (property/tour-scoped).
//
// A client may tour 2–5 properties in one block; each tour gets its OWN
// Tour Follow-Up (due that tour + 2h), created here — the exact twin of the
// per-property guest card (lib/leads/guestCardWorkflow.ts). The single canonical
// outcome handler (completeTourFollowUp) records "How did the tour go?" for ONE
// tour/property without ever touching another property's follow-up or outcome.
//
// LOCKED-BASELINE SAFETY: Schedule Tour / Guest Card / Reschedule / Cancel are
// unchanged. Tour occurrence (lead_tours.status) and client decision
// (lead_tours.outcome) are stored as ORTHOGONAL facts.

import type { SupabaseClient } from "@supabase/supabase-js"
import { CURRENT_WORKFLOW_VERSION, type TourOutcome } from "@bc/companion-shared"
import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { recordTimelineEvent } from "@/lib/leads/timeline"
import { createManualTask } from "@/lib/leads/createManualTask"
import { planForOutcome, nextTourFollowUpKey, tourFollowUpTitle, type TourFollowUpRow } from "@/lib/leads/tourFollowUp"
export { planForOutcome, type TourOutcomePlan } from "@/lib/leads/tourFollowUp"

type FavoriteRow = { id: number | string; property_name?: string | null; property_address?: string | null }

export type CreatedTourFollowUpAction = {
  id: number
  lead_id: number
  title: string
  due_at: string
  priority: "low" | "medium" | "high"
  property_id: number | null
  property_name: string | null
  completed: boolean
  completed_at: string | null
}

// The pure ladder lives in lib/leads/tourFollowUp.ts (no DB), so tests and the
// components can import it without the browser Supabase client. Re-exported here
// because this module is where the ladder is written.
export {
  TOUR_FOLLOW_UP_LADDER, nextTourFollowUpKey, isTourFollowUpRow, tourFollowUpTitle,
  type TourFollowUpKey,
} from "@/lib/leads/tourFollowUp"

/**
 * Create the next per-property Tour Follow-Up rung for a scheduled tour, due =
 * that tour + 2h (dueAt is passed pre-computed by the caller). The twin of
 * createGuestCardForProperty. Returns the created row, or null when this property
 * already has an open rung or has used all three.
 *
 * ── WHY THE STATUS FILTER IS LOAD-BEARING ───────────────────────────────────────
 * This selected every row for (lead, property, 'tour_follow_up') regardless of
 * status and refused to create when ANY existed. A COMPLETED follow-up therefore
 * blocked the property permanently: Ka'Leah Davis toured Altitude at Brooks, the
 * follow-up was completed, she came back for another unit, and no second follow-up
 * could ever be created for that property again.
 *
 * The database never agreed with that. Its unique index is partial —
 * `where status = 'open'` (20260815000000) — so the schema always permitted a
 * completed rung to be succeeded. The check here was simply stricter than the
 * constraint it was standing in for. Now it reads the ladder and the index enforces
 * the same rule, rather than the two disagreeing.
 */
export async function createTourFollowUpForProperty(
  client: SupabaseClient,
  leadId: number | string,
  favorite: FavoriteRow,
  dueAt: string,
): Promise<CreatedTourFollowUpAction | null> {
  // Every row for this (lead, property) — a handful at most — then filtered by the
  // SAME pure matcher the components use. Filtering in SQL on action_key alone would
  // miss a row written before action_key existed, which carries only a title.
  const { data: existing, error: checkError } = await client
    .from("lead_next_actions")
    .select("id, action_key, title, status, completed")
    .eq("lead_id", leadId)
    .eq("property_id", favorite.id)
  if (checkError) {
    console.error("[tour-follow-up] dedup check failed:", checkError)
    return null
  }
  const key = nextTourFollowUpKey((existing ?? []) as TourFollowUpRow[])
  // Null = this property already has an open rung, or all three are spent. Either
  // way the correct answer is "create nothing", not "create a duplicate".
  if (!key) return null

  const propertyName = (favorite.property_name || favorite.property_address || "").toString().trim() || null
  const { data: created, error: insertError } = await client
    .from("lead_next_actions")
    .insert([
      {
        lead_id: leadId,
        title: tourFollowUpTitle(key),
        due_at: dueAt, // this property's tour + 2h
        priority: "medium",
        property_id: favorite.id,
        property_name: propertyName,
        action_key: key,
        action_type: "workflow",
        origin: "workflow",
        sequence: null,
        workflow_version: CURRENT_WORKFLOW_VERSION,
        status: "open",
      },
    ])
    .select("*")
    .single()
  if (insertError) {
    console.error("[tour-follow-up] create failed:", insertError)
    return null
  }
  return created as CreatedTourFollowUpAction
}

// The optimistic patch the caller applies to localTours / localNextActions /
// localLeads (mirrors how completeSetupTour / rescheduleTour report changes).
export type TourFollowUpPatch = {
  tourId: number | string
  tourStatus: "completed" | "no_show"
  tourOutcome: TourOutcome
  completedActionId: number | string | null // the tour_follow_up row completed
  reopenedSetupTourId: number | string | null
  leadPatch: { crm_status?: string; top_pick_favorite_id?: number | null }
}

/**
 * CANONICAL Tour Follow-Up completion for ONE tour/property. Records the outcome
 * (status + outcome on lead_tours, immutable lead_timeline event), completes THIS
 * property's tour_follow_up, updates Top Pick, and produces the next canonical
 * action per the outcome plan. Never touches another property's follow-up.
 * Demo leads skip DB writes; the caller mirrors the same state locally.
 */
export async function completeTourFollowUp(opts: {
  lead: any
  // The lead_tours row this follow-up is about (real DB id after the reschedule fix).
  tour: { id: number | string; property_id: number | null; scheduled_at: string }
  // The linked Favorite (property_name snapshot for the created action + timeline).
  favorite: FavoriteRow
  outcome: TourOutcome
  // The open tour_follow_up row to complete (this property's).
  followUpActionRow: { id: number | string } | null
  // The completed setup_tour row to reopen when the plan returns to Schedule Tour.
  setupTourRow?: { id: number | string } | null
  // ISO due for the dated manual "Follow Up" (Still Deciding / Other). Required
  // only when the plan.createFollowUpTask is true.
  followUpDueAt?: string | null
  // Optional free note (Other).
  note?: string | null
  now: string
  // Apply the local optimistic patch (tour status/outcome, completed follow-up,
  // reopened setup_tour, lead crm_status + top pick).
  onOptimistic?: (patch: TourFollowUpPatch) => void
  // The new next action (start_application "Apply" OR the dated manual "Follow Up").
  onActionCreated?: (action: any) => void
}): Promise<void> {
  const { lead, tour, favorite, outcome, followUpActionRow, setupTourRow, followUpDueAt, note, now, onOptimistic, onActionCreated } = opts
  const demo = isDemoLeadId(lead.id)
  const plan = planForOutcome(outcome)
  const propertyName = (favorite.property_name || favorite.property_address || "").toString().trim() || null

  // Top Pick resolution (durable, one-per-lead — leads.top_pick_favorite_id).
  const propId = tour.property_id
  let nextTopPick: number | null | undefined = undefined // undefined = unchanged
  if (plan.topPick === "set") nextTopPick = propId == null ? null : Number(propId)
  else if (plan.topPick === "clear_if_match" && String(lead.top_pick_favorite_id ?? "") === String(propId ?? "")) nextTopPick = null

  const nextStage: string | undefined = plan.advanceToDoneTouring ? "done_touring" : undefined

  // 1) Tour: record occurrence (status) + decision (outcome). [real only]
  if (!demo) {
    const { error } = await supabase
      .from("lead_tours")
      .update({ status: plan.tourStatus, outcome })
      .eq("id", tour.id)
    if (error) console.error("[tour-follow-up] update lead_tours failed:", error)
  }

  // 2) Complete THIS property's tour_follow_up. [real only]
  if (!demo && followUpActionRow?.id != null) {
    const { error } = await supabase
      .from("lead_next_actions")
      .update({ completed: true, completed_at: now, status: "completed" })
      .eq("id", followUpActionRow.id)
    if (error) console.error("[tour-follow-up] complete action failed:", error)
  }

  // 3) leads: Top Pick + optional stage advance (done_touring, NEVER applied here). [real only]
  if (!demo && (nextTopPick !== undefined || nextStage !== undefined)) {
    const patch: Record<string, unknown> = {}
    if (nextTopPick !== undefined) patch.top_pick_favorite_id = nextTopPick
    if (nextStage !== undefined) patch.crm_status = nextStage
    const { error } = await supabase.from("leads").update(patch).eq("id", lead.id)
    if (error) console.error("[tour-follow-up] update leads failed:", error)
  }

  // 4) Immutable history (best-effort, non-blocking; demo-safe inside).
  recordTimelineEvent({
    leadId: lead.id,
    type: "tour_outcome",
    occurredAt: now,
    metadata: {
      tour_id: tour.id,
      property_id: propId,
      property_name: propertyName,
      outcome,
      ...(note ? { note } : {}),
    },
  })

  // 5) Reopen Schedule Tour (return to the tour-scheduling action). [real only]
  if (plan.reopenSetupTour && !demo && setupTourRow?.id != null) {
    const { error } = await supabase
      .from("lead_next_actions")
      .update({ completed: false, completed_at: null, status: "open", due_at: now })
      .eq("id", setupTourRow.id)
    if (error) console.error("[tour-follow-up] reopen setup_tour failed:", error)
  }

  onOptimistic?.({
    tourId: tour.id,
    tourStatus: plan.tourStatus,
    tourOutcome: outcome,
    completedActionId: followUpActionRow?.id ?? null,
    reopenedSetupTourId: plan.reopenSetupTour ? (setupTourRow?.id ?? null) : null,
    leadPatch: {
      ...(nextStage !== undefined ? { crm_status: nextStage } : {}),
      ...(nextTopPick !== undefined ? { top_pick_favorite_id: nextTopPick } : {}),
    },
  })

  // 6) Next canonical action.
  if (plan.createStartApplication) {
    const created = await createStartApplicationForTopPick(lead, favorite, propId, now, demo)
    if (created) onActionCreated?.(created)
  } else if (plan.createFollowUpTask && followUpDueAt) {
    // Reuse the ONE canonical manual-task system (Add Task) — a dated decision
    // "Follow Up", NOT another tour_follow_up. Demo-safe inside createManualTask.
    const created = await createManualTask({ lead, title: "Follow Up", dueAt: followUpDueAt, notes: note ?? null, now })
    if (created) onActionCreated?.(created)
  }
}

/**
 * Create the canonical "Apply" (start_application) action for the lead's Top Pick
 * property — due now (do-it-next). Completing it later advances the lead to
 * 'applied' (firing the existing check_application rule). No application record is
 * fabricated. Demo synthesizes the row locally.
 */
async function createStartApplicationForTopPick(
  lead: any,
  favorite: FavoriteRow,
  propertyId: number | null,
  now: string,
  demo: boolean,
): Promise<any | null> {
  const propertyName = (favorite.property_name || favorite.property_address || "").toString().trim() || null
  if (demo) {
    return {
      id: `demo-act-apply-${now}`,
      lead_id: lead.id,
      title: "Apply",
      due_at: now,
      priority: "high",
      property_id: propertyId,
      property_name: propertyName,
      action_key: "start_application",
      action_type: "workflow",
      origin: "workflow",
      completed: false,
      status: "open",
    }
  }
  const { data, error } = await supabase
    .from("lead_next_actions")
    .insert([
      {
        lead_id: lead.id,
        title: "Apply",
        due_at: now,
        priority: "high",
        property_id: propertyId,
        property_name: propertyName,
        action_key: "start_application",
        action_type: "workflow",
        origin: "workflow",
        sequence: null,
        workflow_version: CURRENT_WORKFLOW_VERSION,
        status: "open",
      },
    ])
    .select("*")
    .single()
  if (error) {
    console.error("[tour-follow-up] create start_application failed:", error)
    return null
  }
  return data
}
