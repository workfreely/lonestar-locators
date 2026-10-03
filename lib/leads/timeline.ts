import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"

// The CRM's append-only activity history (table: lead_timeline). Today it
// records only communication events; the union widens as the activity feed
// grows (notes, stage changes, tours, …) without a new table.
// 'contact_attempt' = a call/text was attempted but contact was NOT confirmed
// (e.g. "No Answer") — logged as activity WITHOUT advancing the lead's stage.
// 'text_sent' = an outreach text WAS sent to a still-New lead but is NOT
// successful contact (the client hasn't replied) — drives "Sent Text" / "Waiting
// for Reply". The type column is free `text` (no CHECK), so no migration.
// 'tour_outcome' = a Tour Follow-Up was recorded for a specific tour/property
// (metadata: { tour_id, property_id, property_name, outcome, note? }). This is
// the immutable history; lead_tours.outcome holds the fast current-state read.
// 'application_outcome' = a Check Application outcome was recorded for the Top Pick
// (metadata: { check_action_id, property_id, property_name, status, note? }). The
// immutable history; leads.application_status holds the fast current-state read.
// 'lease_signed' = the client signed the lease for the Top Pick (Confirm Lease →
// Yes, Lease Signed): the explicit close point (metadata: { confirm_action_id,
// property_id, property_name }). The immutable record; crm_status 'closed' +
// closed_at hold the current state.
// 'invoice_sent' = the agent confirmed they sent the invoice to the property
// (Send Invoice → Yes, Invoice Sent): the explicit send point (metadata:
// { send_action_id, property_id, property_name }). leads.invoice_submitted holds
// the durable current state; this is the immutable "when/which property" record.
// 'commission_paid' = the agent confirmed the commission payment was received
// (Confirm Payment → Yes, Commission Paid): the explicit received point (metadata:
// { commission_action_id, property_id, property_name }). leads.invoice_commission_paid
// holds the durable current state; this is the immutable "when/which property" record.
// 'rebate_sent' = the agent confirmed they sent the Cash Rebate to the client
// (Send Rebate → Mark Rebate Sent): the explicit sent point (metadata:
// { rebate_action_id, property_id, property_name, rebate_amount }). No durable
// leads.* flag exists for this — the completed send_rebate action row IS the state;
// this is the immutable "when/which property/how much" record.
// 'on_hold' = the lead was placed On Hold (search paused, crm_status preserved),
// metadata: { hold_follow_up_at, from_stage }. 'resumed' = Resume Search cleared
// the hold, metadata: { to_stage } (the preserved stage it returned to). Both are
// history only; leads.held_at / hold_follow_up_at hold the durable current state.
// 'criteria_changed' = Client History: one meaningful update to the five tracked
// search criteria, metadata: { source, changes[] } (see lib/leads/criteriaHistory).
// ONE event per update, not per field. History only — `leads` remains the source
// of truth for matching, exactly like every other type here.
export type LeadTimelineType = "first_contact" | "follow_up" | "contact_attempt" | "text_sent" | "tour_outcome" | "application_outcome" | "lease_signed" | "invoice_sent" | "commission_paid" | "rebate_sent" | "guest_card" | "on_hold" | "resumed" | "criteria_changed"
export type LeadTimelineMethod = "call" | "text" | "email"

export type TimelineEventInput = {
  leadId: number | string
  type: LeadTimelineType
  method?: LeadTimelineMethod | null
  // 0 = first contact, 1..N = follow-up number; null when not a sequence.
  sequence?: number | null
  metadata?: Record<string, unknown>
  // ISO string; defaults to now. Pass the same timestamp used for the
  // corresponding `leads` write so the history and the cache agree.
  occurredAt?: string
}

// Master switch for background timeline logging. The lead_timeline table is
// applied on LB (verified) and RLS-scoped, so logging is ENABLED: append-only,
// best-effort, and still fully non-blocking (a write can never affect the
// workflow — Last/Next Action, stage movement, workflow generation, card
// movement, status are all driven by `leads`/`lead_next_actions`, never this).
const LEAD_TIMELINE_ENABLED = true

/**
 * Append one immutable row to the lead timeline. Deliberately
 * fire-and-forget: a history write must NEVER block or fail the workflow
 * action that triggered it — `leads` (follow_up_count, crm_status, …) remains
 * the source of truth for live state; this is history only. `created_by` is
 * filled by the table's `default auth.uid()`. No-op while disabled above.
 */
export function recordTimelineEvent(event: TimelineEventInput): void {
  if (!LEAD_TIMELINE_ENABLED) return

  // Demo leads have string ids ("demo-1") and live entirely client-side; a
  // lead_timeline insert (lead_id bigint) would throw 22P02. Demo never writes.
  if (isDemoLeadId(event.leadId)) return

  // Fully isolated best-effort logging: a try/catch guards any synchronous
  // throw, and the second `.then` arg swallows a rejected promise — so a
  // timeline write can NEVER throw into, block, or bubble out of the workflow
  // action that called it (e.g. before the lead_timeline migration is applied,
  // this just logs and moves on).
  try {
    supabase
      .from("lead_timeline")
      .insert({
        lead_id: event.leadId,
        type: event.type,
        method: event.method ?? null,
        sequence: event.sequence ?? null,
        metadata: event.metadata ?? {},
        occurred_at: event.occurredAt ?? new Date().toISOString(),
      })
      .then(
        ({ error }) => {
          if (error) {
            // Surface the real reason (was logging as `{}`) — e.g. a missing
            // table means the migration hasn't been applied.
            console.error("[lead-timeline] insert failed (non-blocking):", error.message || error.code || error)
          }
        },
        (err) => console.error("[lead-timeline] insert rejected (non-blocking):", err),
      )
  } catch (err) {
    console.error("[lead-timeline] insert threw (non-blocking):", err)
  }
}
