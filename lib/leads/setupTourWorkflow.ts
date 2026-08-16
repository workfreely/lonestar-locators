import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { createGuestCardForProperty } from "@/lib/leads/guestCardWorkflow"
import { createTourFollowUpForProperty } from "@/lib/leads/tourFollowUpWorkflow"
import { tourFollowUpDueAt, tourFollowUpDueForTour } from "@/lib/leads/tourFollowUp"

// Pure tour date/time helpers now live in lib/leads/tourFollowUp.ts (no DB), so
// tests can import them without pulling in the browser Supabase client. Re-export
// for existing call sites.
export { TOUR_FOLLOW_UP_OFFSET_HOURS, tourFollowUpDueAt, localTourToUtc } from "@/lib/leads/tourFollowUp"

/**
 * CANONICAL Ready-to-Tour "Schedule Tour" completion — the single authoritative
 * path for the explicit "Yes, Scheduled" confirmation, shared by the CRM and
 * Beast Companion (mirrors completeFollowUp / completeSendList). One place owns
 * the transition so no state change is duplicated across surfaces.
 *
 * Scheduling a tour and completing a tour are DIFFERENT events. On "Yes,
 * Scheduled" this:
 *   1. inserts the canonical lead_tours appointment (scheduled_at = UTC instant);
 *   2. completes the open setup_tour row so Last Action derives "Tour Scheduled";
 *   3. computes the Tour Follow-Up due = MAX(scheduled_at where status='scheduled')
 *      + 2h across ALL the lead's active tours (multi-tour ready);
 *   4. creates EXACTLY ONE open tour_follow_up action (deduped by action_key via
 *      createWorkflowActionIfNeeded — moving to Done Touring later never doubles it);
 *   5. sets leads.next_action_date to that same due; and
 *   6. KEEPS the lead in Ready to Tour — NO stage change (never Done Touring), and
 *      NO second Schedule Tour successor.
 *
 * Demo leads: the DB writes are skipped (isDemoLeadId); the caller synthesizes the
 * completed setup_tour + the open tour_follow_up locally (same as Send List/FU).
 */
export async function completeSetupTour(opts: {
  lead: any
  // The open setup_tour row to complete (real leads). Null for demo/synthesized.
  actionRow?: { id: number | string } | null
  // The scheduled tour instant (UTC ISO) — already converted from local wall-clock.
  scheduledAt: string
  // The Favorite Property (lead_favorites.id) this tour is for → lead_tours.property_id.
  // Null when the agent chose "Other Property" / "Schedule Without Property"
  // (property_id is nullable — the tour is still created).
  propertyId: number | string | null
  // The scheduled Favorite's display name (snapshot on the guest card action, so
  // the Workspace/Companion can label "Send Guest Card — {property}").
  propertyName?: string | null
  // Single completion timestamp for the setup_tour row.
  now: string
  // Reflect the advanced lead (next_action_date) locally + persist.
  onOptimistic?: (updatedLead: any, tourFollowUpDue: string) => void
  // Reflect the created tour_follow_up action row.
  onWorkflowAction?: (action: any) => void
  // Reflect the per-property "Send Guest Card" action created for this scheduled
  // property (Phase 1 of Schedule Tour → Send Guest Card → Tour Follow-Up).
  onGuestCardCreated?: (action: any) => void
  // Reflect the new lead_tours appointment locally so the Workspace can surface
  // "Tour Scheduled" under the linked Favorite immediately (no manual refresh).
  onTourScheduled?: (tour: { id: number | string | null; lead_id: number | string; property_id: number | null; scheduled_at: string; status: "scheduled" }) => void
}): Promise<void> {
  const { lead, actionRow, scheduledAt, propertyId, propertyName, now, onOptimistic, onWorkflowAction, onTourScheduled, onGuestCardCreated } = opts

  const demo = isDemoLeadId(lead.id)
  const favoriteId = propertyId === "" || propertyId == null ? null : Number(propertyId)

  // 1) Insert the canonical appointment (real leads only), linked to the chosen
  //    Favorite (lead_tours.property_id → lead_favorites.id). RLS/ownership stamped
  //    by the lead_tours trigger, exactly like every other CRM insert. Capture the
  //    inserted id so the optimistic local row carries the SAME id the DB assigned:
  //    otherwise the local row used a synthetic id and a later Reschedule's UPDATE
  //    (keyed on the tour id) would miss the real row — the reschedule wouldn't persist.
  let insertedTourId: number | string | null = null
  if (!demo) {
    const { data, error } = await supabase
      .from("lead_tours")
      .insert([{ lead_id: lead.id, scheduled_at: scheduledAt, property_id: favoriteId, status: "scheduled" }])
      .select("id")
      .maybeSingle()
    if (error) console.error("[setup-tour] insert lead_tours failed:", error)
    insertedTourId = data?.id ?? null
  }

  // Optimistically surface the appointment against its Favorite (both demo and
  // real) — now with the real DB id when available (demo has no DB → the caller
  // falls back to a synthetic id, which is fine since demo reschedules stay local).
  onTourScheduled?.({ id: insertedTourId, lead_id: lead.id, property_id: favoriteId, scheduled_at: scheduledAt, status: "scheduled" })

  // 2) Compute the Tour Follow-Up due = last ACTIVE scheduled tour + 2h. For real
  //    leads read every scheduled tour (multi-tour ready); demo uses just this one.
  let followUpDue = tourFollowUpDueAt([{ scheduledAt, status: "scheduled" }]) as string
  if (!demo) {
    const { data: tours } = await supabase
      .from("lead_tours")
      .select("scheduled_at, status")
      .eq("lead_id", lead.id)
      .eq("status", "scheduled")
    const rows = (tours ?? []).map((t: any) => ({ scheduledAt: t.scheduled_at, status: t.status }))
    followUpDue = tourFollowUpDueAt(rows.length ? rows : [{ scheduledAt, status: "scheduled" }]) as string
  }

  // 3) Complete the persisted setup_tour row (real leads) → Last Action "Tour
  //    Scheduled". Snapshot the scheduled Favorite's name on the row so the Last
  //    Action line can read "Tour Scheduled · {property}" (null for a
  //    Without-Property tour → the line stays just "Tour Scheduled").
  if (!demo && actionRow?.id != null) {
    const { error } = await supabase
      .from("lead_next_actions")
      .update({ completed: true, completed_at: now, property_name: propertyName ?? null })
      .eq("id", actionRow.id)
    if (error) console.error("[setup-tour] complete setup_tour row failed:", error)
  }

  // 4) Reflect the advanced lead cache locally (next_action_date = follow-up due;
  //    stays in Ready to Tour). Then persist for real leads.
  onOptimistic?.({ ...lead, next_action_date: followUpDue }, followUpDue)

  if (demo) return

  const { error: cacheErr } = await supabase
    .from("leads")
    .update({ next_action_date: followUpDue })
    .eq("id", lead.id)
  if (cacheErr) console.error("[setup-tour] advance next_action_date failed:", cacheErr)

  // 5) PER-PROPERTY Tour Follow-Up — one per toured property, due THIS tour + 2h
  //    (Foundry 9:00 → 11:00, Skyline 13:00 → 15:00), so completing one never
  //    touches another. Only for a linked Favorite; "Without Property" tours get
  //    none. Per-property dedup means re-scheduling the same property never doubles.
  if (favoriteId != null) {
    const followUp = await createTourFollowUpForProperty(
      supabase,
      lead.id,
      { id: favoriteId, property_name: propertyName ?? null },
      tourFollowUpDueForTour(scheduledAt),
    )
    if (followUp) onWorkflowAction?.(followUp)
  }

  // 6) Send Guest Card — the per-property action for THIS scheduled property
  //    (only when the tour is linked to a Favorite; "Without Property" tours get
  //    none). Due now, so it's the primary Next Action ahead of the future Tour
  //    Follow-Up. Per-property dedup means a re-scheduled property never doubles.
  if (favoriteId != null) {
    const guestCard = await createGuestCardForProperty(supabase, lead.id, {
      id: favoriteId,
      property_name: propertyName ?? null,
    })
    if (guestCard) onGuestCardCreated?.(guestCard)
  }
}

// Recompute the Tour Follow-Up due from every ACTIVE scheduled tour a lead has
// (multi-tour safe). Real leads read the live lead_tours rows; demo/without-DB
// callers pass a fallback single instant. Returns null when nothing is scheduled.
async function activeTourFollowUpDue(leadId: number | string, fallbackScheduledAt?: string): Promise<string | null> {
  const { data: tours } = await supabase
    .from("lead_tours")
    .select("scheduled_at, status")
    .eq("lead_id", leadId)
    .eq("status", "scheduled")
  const rows = (tours ?? []).map((t: any) => ({ scheduledAt: t.scheduled_at, status: t.status }))
  if (rows.length) return tourFollowUpDueAt(rows)
  return fallbackScheduledAt ? tourFollowUpDueAt([{ scheduledAt: fallbackScheduledAt, status: "scheduled" }]) : null
}

/**
 * CANONICAL reschedule — the single authoritative path for editing an existing
 * tour (shared by the Workspace, and by any future Companion edit). It UPDATES
 * the existing lead_tours row in place (NEVER inserts a duplicate) and keeps the
 * ONE open tour_follow_up in sync:
 *   1. update lead_tours.scheduled_at (+ property_id if the Favorite changed);
 *   2. recompute the follow-up due = last active scheduled tour + 2h;
 *   3. move the SAME tour_follow_up row's due_at (no second follow-up);
 *   4. set leads.next_action_date to that due; and
 *   5. KEEP the lead Ready to Tour (the completed setup_tour row is untouched, so
 *      Last Action stays "Tour Scheduled" — no new action type for display text).
 * Demo leads skip the DB writes; the caller mirrors the same state locally.
 */
export async function rescheduleTour(opts: {
  lead: any
  tourId: number | string
  scheduledAt: string // new UTC instant (already converted from local wall-clock)
  propertyId: number | string | null // new Favorite id, or null for Other/Without
  // The open tour_follow_up row to MOVE (never a second one). Null → none to move.
  followUpActionRow?: { id: number | string } | null
  now: string
  onOptimistic?: (updatedLead: any, tourFollowUpDue: string) => void
}): Promise<void> {
  const { lead, tourId, scheduledAt, propertyId, followUpActionRow, onOptimistic } = opts
  const demo = isDemoLeadId(lead.id)
  const favoriteId = propertyId === "" || propertyId == null ? null : Number(propertyId)

  // 1) Update the appointment in place.
  if (!demo) {
    const { error } = await supabase
      .from("lead_tours")
      .update({ scheduled_at: scheduledAt, property_id: favoriteId })
      .eq("id", tourId)
    if (error) console.error("[setup-tour] reschedule lead_tours failed:", error)
  }

  // 2) THIS tour's follow-up recalculates to THIS tour + 2h (property-scoped) —
  //    other properties' follow-ups are separate rows and are never touched.
  const followUpDue = tourFollowUpDueForTour(scheduledAt)

  // 3) Move ONLY this property's tour_follow_up (the caller passes the row for
  //    this tour's property). Its property_id is unchanged here.
  if (!demo && followUpActionRow?.id != null) {
    const { error } = await supabase
      .from("lead_next_actions")
      .update({ due_at: followUpDue })
      .eq("id", followUpActionRow.id)
    if (error) console.error("[setup-tour] move tour_follow_up failed:", error)
  }

  // 4) Advance the lead cache locally, then persist. Stays Ready to Tour.
  onOptimistic?.({ ...lead, next_action_date: followUpDue }, followUpDue)
  if (demo) return
  const { error: cacheErr } = await supabase.from("leads").update({ next_action_date: followUpDue }).eq("id", lead.id)
  if (cacheErr) console.error("[setup-tour] reschedule advance next_action_date failed:", cacheErr)
}

/**
 * CANONICAL cancel — the single authoritative path for canceling a scheduled
 * tour. History is PRESERVED (the lead_tours row is marked 'canceled', never
 * hard-deleted). Then:
 *   • if OTHER active scheduled tours remain (multi-tour block), the ONE
 *     tour_follow_up simply retimes to the last remaining tour + 2h and the lead
 *     stays "tour scheduled";
 *   • otherwise the tour_follow_up is removed (so it can never come due) and the
 *     completed setup_tour row is REOPENED (completed=false, due=now) so
 *     isTourScheduled() flips false and "Schedule Tour" returns as the Next
 *     Action.
 * The lead ALWAYS stays Ready to Tour (canceling is never Done Touring). Demo
 * leads skip the DB writes; the caller mirrors the same state locally.
 *
 * onOptimistic's second arg is the remaining follow-up due when tours remain, or
 * null when the tour was fully canceled (Schedule Tour restored).
 */
export async function cancelTour(opts: {
  lead: any
  tourId: number | string
  // The completed setup_tour row to REOPEN when no active tour remains. Null → none.
  setupTourRow?: { id: number | string } | null
  // The open tour_follow_up row to remove/retime. Null → none.
  followUpActionRow?: { id: number | string } | null
  // The canceled property's UNSENT "Send Guest Card" row to remove, so it stops
  // gating Tour Follow-Up. Null when there is none, or when it was already SENT
  // (a completed guest card is preserved as history — never passed here).
  guestCardActionRow?: { id: number | string } | null
  now: string
  onOptimistic?: (updatedLead: any, remainingFollowUpDue: string | null) => void
}): Promise<void> {
  const { lead, tourId, setupTourRow, followUpActionRow, guestCardActionRow, now, onOptimistic } = opts
  const demo = isDemoLeadId(lead.id)

  // 1) Cancel the appointment (preserve history — NOT a hard delete).
  if (!demo) {
    const { error } = await supabase.from("lead_tours").update({ status: "canceled" }).eq("id", tourId)
    if (error) console.error("[setup-tour] cancel lead_tours failed:", error)
  }

  // 1b) Remove this property's UNSENT guest card (if any) — a canceled tour no
  //     longer needs a card, and it must stop gating Tour Follow-Up. A card that
  //     was already SENT is left intact (history; not passed in).
  if (!demo && guestCardActionRow?.id != null) {
    const { error } = await supabase.from("lead_next_actions").delete().eq("id", guestCardActionRow.id)
    if (error) console.error("[setup-tour] remove unsent guest card failed:", error)
  }

  // 1c) Remove THIS canceled property's tour_follow_up (property-scoped — other
  //     properties' follow-ups are separate rows and stay untouched). The tour is
  //     canceled, so its follow-up can never come due.
  if (!demo && followUpActionRow?.id != null) {
    const { error } = await supabase.from("lead_next_actions").delete().eq("id", followUpActionRow.id)
    if (error) console.error("[setup-tour] remove tour_follow_up failed:", error)
  }

  // 2) Any OTHER active scheduled tours left? (multi-tour). Demo is single-tour,
  //    so treat it as fully canceled → restore Schedule Tour. remainingDue is only
  //    a next_action_date cache hint; each remaining property keeps its own follow-up.
  const remainingDue = demo ? null : await activeTourFollowUpDue(lead.id)

  if (remainingDue) {
    // Still touring other properties — their follow-ups are already correct; just
    // refresh the lead's next_action_date cache and stay Ready to Tour (scheduled).
    onOptimistic?.({ ...lead, next_action_date: remainingDue }, remainingDue)
    if (!demo) await supabase.from("leads").update({ next_action_date: remainingDue }).eq("id", lead.id)
    return
  }

  // 3) No active tour remains → reopen Schedule Tour.
  if (!demo && setupTourRow?.id != null) {
    // Reopen (fresh, immediate) so isTourScheduled() flips false and the stage's
    // Schedule Tour surfaces again as the actionable Next Action.
    const { error } = await supabase
      .from("lead_next_actions")
      .update({ completed: false, completed_at: null, status: "open", due_at: now })
      .eq("id", setupTourRow.id)
    if (error) console.error("[setup-tour] reopen setup_tour failed:", error)
  }
  onOptimistic?.({ ...lead, next_action_date: now }, null)
  if (!demo) await supabase.from("leads").update({ next_action_date: now }).eq("id", lead.id)
}
