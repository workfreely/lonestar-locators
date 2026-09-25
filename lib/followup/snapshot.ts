// Follow-Up Agent — LIVE STATE SNAPSHOTS (server-side, service role).
//
// Builds the pure engine snapshots (LeadSnapshot / ConversationSnapshot /
// ShareSnapshot / RunSnapshot) from CURRENT database state. Used by the dispatcher
// AND by claim-time revalidation — both must read the SAME live state so a message
// approved at dispatch is re-checked against reality immediately before hand-off.

import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  ConversationSnapshot,
  LeadSnapshot,
  RunSnapshot,
  SequenceKey,
  ShareSnapshot,
} from "./types"

const DEFAULT_TZ = "America/Chicago"

export type LeadRow = {
  id: number
  first_name: string | null
  phone: string | null
  beds: string | null
  property_type: string | null
  move_date: string | null
  crm_status: string | null
  sms_opt_in: boolean | null
  followup_opt_in: boolean | null
  followup_enrolled_at: string | null
  applied_at: string | null
  created_at: string | null
  owner_user_id: string | null
  workspace_id: string
}

export const LEAD_COLUMNS =
  "id, first_name, phone, beds, property_type, move_date, crm_status, sms_opt_in, followup_opt_in, followup_enrolled_at, applied_at, created_at, owner_user_id, workspace_id"

function monthLabel(moveDate: string | null): string | null {
  if (!moveDate) return null
  const d = new Date(moveDate.length <= 10 ? `${moveDate}T00:00:00Z` : moveDate)
  if (isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long" }).format(d)
}

/** Resolve agent first name + IANA timezone + live account authorization for a lead's owner. */
async function resolveOwnerContext(
  admin: SupabaseClient,
  ownerUserId: string | null,
  workspaceId: string,
): Promise<{ agentFirstName: string | null; timeZone: string; accountAuthorized: boolean }> {
  if (!ownerUserId) return { agentFirstName: null, timeZone: DEFAULT_TZ, accountAuthorized: false }

  const [{ data: profile }, { data: auth }, { data: tz }] = await Promise.all([
    admin
      .from("profiles")
      .select("first_name, preferred_first_name, preferred_name")
      .eq("id", ownerUserId)
      .maybeSingle(),
    admin.from("automated_texting_accounts").select("user_id").eq("user_id", ownerUserId).maybeSingle(),
    admin.rpc("resolve_timezone", { p_profile_id: ownerUserId, p_workspace_id: workspaceId }),
  ])

  const agentFirstName =
    (profile?.preferred_first_name as string | null)?.trim() ||
    (profile?.first_name as string | null)?.trim() ||
    (profile?.preferred_name as string | null)?.trim() ||
    null

  const timeZone = typeof tz === "string" && tz ? tz : DEFAULT_TZ
  return { agentFirstName, timeZone, accountAuthorized: !!auth }
}

export async function buildLeadSnapshot(admin: SupabaseClient, lead: LeadRow): Promise<LeadSnapshot> {
  const { agentFirstName, timeZone, accountAuthorized } = await resolveOwnerContext(
    admin,
    lead.owner_user_id,
    lead.workspace_id,
  )
  return {
    id: lead.id,
    firstName: lead.first_name,
    agentFirstName,
    beds: lead.beds,
    propertyType: lead.property_type,
    moveDate: lead.move_date,
    moveMonthLabel: monthLabel(lead.move_date),
    crmStatus: lead.crm_status,
    smsOptIn: lead.sms_opt_in === true,
    accountAuthorized,
    followupOptIn: lead.followup_opt_in === true,
    appliedAt: lead.applied_at,
    timeZone,
  }
}

/** Latest inbound (is_from_me=false) and latest manual outbound (is_from_me=true) for the lead. */
export async function buildConversationSnapshot(
  admin: SupabaseClient,
  leadId: number,
): Promise<ConversationSnapshot> {
  const [{ data: inbound }, { data: outbound }] = await Promise.all([
    admin
      .from("companion_messages")
      .select("sent_at")
      .eq("lead_id", leadId)
      .eq("is_from_me", false)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("companion_messages")
      .select("sent_at")
      .eq("lead_id", leadId)
      .eq("is_from_me", true)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  return {
    lastInboundAt: (inbound?.sent_at as string | null) ?? null,
    lastManualOutboundAt: (outbound?.sent_at as string | null) ?? null,
  }
}

/** The client-share signals the list-sent / done-selecting sequences read. */
export async function buildShareSnapshot(admin: SupabaseClient, leadId: number): Promise<ShareSnapshot> {
  const { data: share } = await admin
    .from("client_recommendation_shares")
    .select("id, sent_at, done_selecting_at, favorited_count")
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  // Availability is keyed by share_id (submitted state only). Only relevant to the
  // list_sent objective; resolved through the lead's most-recent share.
  let availabilitySubmittedAt: string | null = null
  if (share?.id) {
    const { data: avail } = await admin
      .from("client_tour_availability")
      .select("submitted_at, status")
      .eq("share_id", share.id as string)
      .maybeSingle()
    if (avail && (avail.status as string) === "submitted") {
      availabilitySubmittedAt = (avail.submitted_at as string | null) ?? null
    }
  }

  return {
    sentAt: (share?.sent_at as string | null) ?? null,
    doneSelectingAt: (share?.done_selecting_at as string | null) ?? null,
    favoritedCount: (share?.favorited_count as number | null) ?? 0,
    availabilitySubmittedAt,
  }
}

export type RunRow = {
  id: string
  lead_id: number
  workspace_id: string
  owner_user_id: string | null
  mode: string
  sequence_key: string
  step_key: string
  step_index: number
  status: string
  next_eligible_at: string | null
  baseline_inbound_at: string | null
  sequence_version: number
  session_date: string | null
  session_tour_count: number | null
}

export function runSnapshotFromRow(run: RunRow): RunSnapshot {
  return {
    sequenceKey: run.sequence_key as SequenceKey,
    stepKey: run.step_key,
    stepIndex: run.step_index,
    status: run.status as RunSnapshot["status"],
    mode: run.mode as RunSnapshot["mode"],
    baselineInboundAt: run.baseline_inbound_at,
    nextEligibleAt: run.next_eligible_at,
    sessionTourCount: run.session_tour_count,
  }
}
