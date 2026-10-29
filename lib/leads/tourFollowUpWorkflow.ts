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
import { AWAITING_REPLY_PLAN, planForOutcome, nextTourFollowUpKey, tourFollowUpTitle, tourFollowUpKeyOf, rungAfter, isTourFollowUpRow, TOUR_FOLLOW_UP_LADDER, type TourFollowUpRow } from "@/lib/leads/tourFollowUp"
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
  TOUR_FOLLOW_UP_LADDER, nextTourFollowUpKey, isTourFollowUpRow, tourFollowUpTitle, tourFollowUpKeyOf, rungAfter,
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
/**
 * Why this is a RESULT and not `CreatedTourFollowUpAction | null`.
 *
 * `null` used to mean three different things: the dedup query failed, there was no
 * rung to create, or the insert was rejected. The first and third are faults the
 * locator must hear about; the second is the correct answer. Collapsing them is
 * exactly how a schema mismatch produced a scheduled tour with no follow-up and no
 * error for eleven hours. Callers must handle `reason: "error"`.
 */
export type RungCreateResult =
  | { ok: true; action: CreatedTourFollowUpAction }
  /** Nothing to do, and that is correct: an open rung already exists, or all three are spent. */
  | { ok: false; reason: "exists" | "spent" }
  /** A write or read failed. Never ignore this. */
  | { ok: false; reason: "error"; message: string }

export async function createTourFollowUpForProperty(
  client: SupabaseClient,
  leadId: number | string,
  favorite: FavoriteRow,
  dueAt: string,
  opts?: { demo?: boolean },
): Promise<RungCreateResult> {
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
    return { ok: false, reason: "error", message: checkError.message }
  }
  const rows = (existing ?? []) as TourFollowUpRow[]
  const key = nextTourFollowUpKey(rows)
  // Null = this property already has an open rung, or all three are spent. Either
  // way the correct answer is "create nothing", not "create a duplicate" — but the
  // two are reported apart, because "spent" ends the ladder and "exists" does not.
  if (!key) {
    const open = rows.filter(isTourFollowUpRow).some((r) => r.completed !== true && String(r.status ?? "open").toLowerCase() === "open")
    return { ok: false, reason: open ? "exists" : "spent" }
  }
  return writeTourFollowUpRung(client, leadId, favorite, key, dueAt, opts?.demo === true)
}

/**
 * Write ONE named rung for a property at an EXPLICIT date. Split out from the
 * deriving function above so the outreach path can state which rung it means
 * (`rungAfter(completed)`) instead of re-deriving it from rows it just changed —
 * two reads of the same table either side of a write is where a race would live.
 */
export async function writeTourFollowUpRung(
  client: SupabaseClient,
  leadId: number | string,
  favorite: FavoriteRow,
  key: (typeof TOUR_FOLLOW_UP_LADDER)[number],
  dueAt: string,
  demo = false,
): Promise<RungCreateResult> {
  const propertyName = (favorite.property_name || favorite.property_address || "").toString().trim() || null

  // Demo leads never touch the database — the same local-row contract
  // createManualTask uses, so the caller's optimistic state looks identical.
  if (demo) {
    return {
      ok: true,
      action: {
        id: `demo-act-${dueAt}-${key}`,
        lead_id: leadId,
        title: tourFollowUpTitle(key),
        due_at: dueAt,
        priority: "medium",
        property_id: favorite.id,
        property_name: propertyName,
        action_key: key,
        action_type: "workflow",
        origin: "workflow",
        sequence: null,
        workflow_version: CURRENT_WORKFLOW_VERSION,
        status: "open",
        completed: false,
      } as unknown as CreatedTourFollowUpAction,
    }
  }

  const { data: created, error: insertError } = await client
    .from("lead_next_actions")
    .insert([
      {
        lead_id: leadId,
        title: tourFollowUpTitle(key),
        due_at: dueAt, // tour + 2h (rung 1 from a tour) or the date the locator chose
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
    return { ok: false, reason: "error", message: insertError.message }
  }
  return { ok: true, action: created as CreatedTourFollowUpAction }
}

// The optimistic patch the caller applies to localTours / localNextActions /
// localLeads (mirrors how completeSetupTour / rescheduleTour report changes).
export type TourFollowUpPatch = {
  tourId: number | string
  tourStatus: "completed" | "no_show"
  /** Null when the status was Waiting for Reply — no client decision was made, so
   *  there is nothing to patch onto the tour and the caller must not invent one. */
  tourOutcome: TourOutcome | null
  completedActionId: number | string | null // the rung completed
  /** False on rungs 2-3: lead_tours was NOT written, so the caller must not patch
   *  it locally either — otherwise the UI shows a change the database refused to
   *  make and the original outcome appears overwritten until the next refresh. */
  recordsTourOutcome: boolean
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
  /** The client's decision, or NULL when awaitingReply is true — Waiting for Reply
   *  is not a decision and must never reach lead_tours.outcome. */
  outcome: TourOutcome | null
  /** Waiting for Reply: the attempt was sent, the client has not answered. Forces
   *  recordsTourOutcome false at EVERY rung (rung 1 included), skips the
   *  tour_outcome timeline event entirely, and only advances the ladder. */
  awaitingReply?: boolean
  // The open rung to complete (this property's). action_key/title identify WHICH
  // rung, which decides whether the physical tour outcome may be written at all.
  followUpActionRow: { id: number | string; action_key?: string | null; title?: string | null } | null
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
  // The new next action (start_application "Apply" OR the next numbered rung).
  onActionCreated?: (action: any) => void
  // A write failed and the locator must be told. Never silent: the caller surfaces
  // this, and nothing is quietly reopened or invented behind their back.
  onError?: (message: string) => void
}): Promise<void> {
  const { lead, tour, favorite, outcome, awaitingReply, followUpActionRow, setupTourRow, followUpDueAt, note, now, onOptimistic, onActionCreated, onError } = opts
  const demo = isDemoLeadId(lead.id)
  // Waiting for Reply has no outcome, so it cannot go through planForOutcome. Its
  // plan is the same shape — complete this attempt, schedule the next — and is
  // defined beside the six rather than branching the switch.
  const awaiting = awaitingReply === true || outcome == null
  const plan = awaiting ? AWAITING_REPLY_PLAN : planForOutcome(outcome as TourOutcome)
  // WHICH rung is being completed. Defaults to rung 1 for a row that predates
  // action_key and carries no recognisable title — the historical shape.
  const rung = tourFollowUpKeyOf({
    action_key: followUpActionRow?.action_key ?? null,
    title: followUpActionRow?.title ?? null,
  }) ?? "tour_follow_up"
  // Only the FIRST attempt describes the visit. Rungs 2 and 3 are later
  // conversations about a tour already reported on, so they must not rewrite its
  // status or outcome — that record is the locator's original answer.
  // Waiting for Reply never describes the visit, at ANY rung — the client has not
  // answered, so rung 1's permission to write the tour does not apply.
  const recordsTourOutcome = rung === "tour_follow_up" && !awaiting
  const propertyName = (favorite.property_name || favorite.property_address || "").toString().trim() || null

  // Top Pick resolution (durable, one-per-lead — leads.top_pick_favorite_id).
  const propId = tour.property_id
  let nextTopPick: number | null | undefined = undefined // undefined = unchanged
  if (plan.topPick === "set") nextTopPick = propId == null ? null : Number(propId)
  else if (plan.topPick === "clear_if_match" && String(lead.top_pick_favorite_id ?? "") === String(propId ?? "")) nextTopPick = null

  const nextStage: string | undefined = plan.advanceToDoneTouring ? "done_touring" : undefined

  // 1) Tour: record occurrence (status) + decision (outcome). [real only, RUNG 1 ONLY]
  if (!demo && recordsTourOutcome) {
    const { error } = await supabase
      .from("lead_tours")
      .update({ status: plan.tourStatus, outcome })
      .eq("id", tour.id)
    if (error) console.error("[tour-follow-up] update lead_tours failed:", error)
  }

  // 2) Complete THIS property's rung. [real only]
  //
  // ABORTS on failure. Continuing would try to open the next rung while this one is
  // still open, which the per-property partial unique index refuses anyway — so the
  // locator would get two failures and a half-applied outcome instead of one honest
  // error and an untouched action they can retry.
  if (!demo && followUpActionRow?.id != null) {
    const { error } = await supabase
      .from("lead_next_actions")
      .update({ completed: true, completed_at: now, status: "completed" })
      .eq("id", followUpActionRow.id)
    if (error) {
      console.error("[tour-follow-up] complete action failed:", error)
      onError?.("That follow-up could not be completed. Nothing was changed — please try again.")
      return
    }
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
  // Append-only, and it now records WHICH attempt produced the answer.
  // `records_tour_outcome: false` marks an event that did NOT touch lead_tours, so
  // history can tell a later conversation apart from the original tour report.
  // NOT written when awaiting a reply. A tour_outcome event with a null outcome
  // would sit in history as though the tour had been reported on. The confirmed
  // send is already recorded by the Companion's text_sent event; there is no second
  // fact to append here.
  if (!awaiting) {
    recordTimelineEvent({
      leadId: lead.id,
      type: "tour_outcome",
      occurredAt: now,
      metadata: {
        tour_id: tour.id,
        property_id: propId,
        property_name: propertyName,
        outcome,
        action_key: rung,
        records_tour_outcome: recordsTourOutcome,
        ...(note ? { note } : {}),
      },
    })
  }

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
    recordsTourOutcome,
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
    // THE NEXT OUTREACH ATTEMPT, at the date the locator chose — never a generic
    // "Follow Up" manual task. A generic task carries action_key null, which no
    // matcher on either surface can resolve, which is why it rendered as the
    // Companion's "coming soon" dead end.
    //
    // The rung is named from the ladder position rather than re-derived from the
    // rows, because this runs immediately after step 2 changed one of them.
    const next = rungAfter(rung)
    if (!next) {
      // End of the ladder. Nothing is created and nothing is invented: the 4th step
      // (Pause Search) is a separate workflow. The modal does not offer a date here,
      // so reaching this branch at all means the caller ignored canScheduleNext.
      console.warn("[tour-follow-up] ladder spent; no successor created for lead", lead.id)
    } else {
      const res = await writeTourFollowUpRung(supabase, lead.id, favorite, next, followUpDueAt, demo)
      if (res.ok) {
        onActionCreated?.(res.action)
      } else if (res.reason === "error") {
        // NOT silent, and NOT auto-reopened. The outcome is recorded and this rung
        // is completed — both true and worth keeping — so the audit history stays
        // honest; only the successor is missing, and the locator is told exactly
        // that so they can act rather than discovering it weeks later.
        onError?.(
          `The outcome was saved, but the ${tourFollowUpTitle(next)} could not be scheduled. Please schedule it again.`,
        )
      }
      // "exists" / "spent" need no message: another open rung already covers this
      // property, or the ladder ended. Both are correct answers, not failures.
    }
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
