import { supabaseAdmin } from "@/lib/supabase/admin"
import { getOAuthClientForUser } from "./getOAuthClientForUser"
import { upsertFollowUpCalendarEvent } from "./createCalendarEvent"
import { recordGoogleFailure, shouldAttemptGoogle } from "./integrationHealth"
import { classifyGoogleError, AUTO_SYNCED_ACTION_KEY } from "./integrationHealthRules"

// CONTACT LEAD → GOOGLE CALENDAR, server-side.
//
// ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────────────────────
// The calendar sync already existed, but only as a route the CRM calls from the browser
// (LeadPanel, FollowUpCalendarSync). A Contact Lead action is created SERVER-SIDE by the workflow
// engine the moment a lead lands, so nothing ever called it: the agent's Agenda showed a 9:00
// deadline their calendar knew nothing about, and would keep doing so until they happened to open
// that lead in the CRM. Agenda and calendar should not silently disagree.
//
// ── SCOPE, DELIBERATELY NARROW ──────────────────────────────────────────────────────────────
// contact_lead ONLY. Every other workflow action keeps the existing CRM-triggered behaviour. One
// event per new lead is a reminder; syncing the whole workflow would be calendar spam, and that
// is a policy decision rather than a technical one.
//
// Reuses upsertFollowUpCalendarEvent — the same helper, the same primary calendar, the same event
// formatting the CRM path already produces. No second calendar system.

/**
 * Create (or update) the calendar event for a Contact Lead action.
 *
 * NEVER THROWS. Lead intake is already complete by the time this runs, and a Google problem must
 * not surface to the renter or roll anything back.
 *
 * Idempotent: it writes the returned event id back to the action, and passes any existing id to
 * the upsert, so a second call updates the same event rather than creating a duplicate.
 */
export { AUTO_SYNCED_ACTION_KEY }

export async function syncContactLeadCalendarEvent(opts: {
  ownerUserId: string
  actionId: number | string
}): Promise<{ synced: boolean; reason: string }> {
  const { ownerUserId, actionId } = opts
  try {
    // A revoked token never heals on its own. Skipping here is what stops every new lead
    // re-triggering the same doomed call — and it is why the failure stays visible on the
    // Integrations page instead of being overwritten by an identical error every time.
    if (!(await shouldAttemptGoogle(ownerUserId))) return { synced: false, reason: "needs_reconnect" }

    const { data: action } = await supabaseAdmin
      .from("lead_next_actions")
      .select("id, lead_id, action_key, title, due_at, status, completed, google_event_id")
      .eq("id", actionId)
      .maybeSingle()
    if (!action) return { synced: false, reason: "action_not_found" }
    if (action.action_key !== AUTO_SYNCED_ACTION_KEY) return { synced: false, reason: "not_contact_lead" }
    // A completed or cancelled action should not gain a NEW event. (Keeping an existing event in
    // step with a later completion is the CRM path's job, which already runs on those edits.)
    if (action.completed || (action.status && action.status !== "open")) {
      return { synced: false, reason: "action_not_open" }
    }
    if (!action.due_at) return { synced: false, reason: "no_due_at" }

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, owner_user_id, first_name, last_name, phone, city, source, desired_rent, beds, move_date")
      .eq("id", action.lead_id)
      .maybeSingle()
    if (!lead) return { synced: false, reason: "lead_not_found" }
    // OWNERSHIP. The event is only ever written to the calendar of the agent who owns the lead,
    // and the owner is resolved from the lead row rather than taken from the caller.
    if (lead.owner_user_id !== ownerUserId) return { synced: false, reason: "owner_mismatch" }

    const client = await getOAuthClientForUser(ownerUserId, { verify: false })
    if (!client) return { synced: false, reason: "not_connected" }

    const eventId = await upsertFollowUpCalendarEvent({
      client,
      existingEventId: action.google_event_id,
      actionKey: action.action_key,
      actionTitle: action.title,
      // The action's ACTUAL due timestamp — already resolved in the agent's working window and
      // timezone by speedToLeadDue. The calendar must agree with the Agenda, not recompute it.
      dueAt: action.due_at,
      lead,
    })

    if (eventId && eventId !== action.google_event_id) {
      await supabaseAdmin.from("lead_next_actions").update({ google_event_id: eventId }).eq("id", action.id)
    }
    return { synced: true, reason: "ok" }
  } catch (e) {
    const code = classifyGoogleError(e)
    await recordGoogleFailure(ownerUserId, code)
    console.warn(`[google/contact-lead] calendar sync skipped for action ${actionId} (${code})`)
    return { synced: false, reason: code }
  }
}
