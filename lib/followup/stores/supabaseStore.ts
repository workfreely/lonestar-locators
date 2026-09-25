// Follow-Up Agent — SUPABASE store adapter (production backing for engine.ts).
//
// Faithful to the queries the dispatcher/claim/ack routes previously ran inline;
// they now live here so production and the simulator share one engine. Writes are
// service-role (supabaseAdmin); the engine calls only through this interface.

import { supabaseAdmin } from "@/lib/supabase/admin"
import {
  LEAD_COLUMNS,
  buildConversationSnapshot,
  buildLeadSnapshot,
  buildShareSnapshot,
  type LeadRow,
  type RunRow,
} from "../snapshot"
import type { FollowupStore, IntentInsert, IntentRow, RunInsert } from "../store"
import type { ConversationSnapshot, LeadSnapshot, ShareSnapshot } from "../types"

const RUN_COLUMNS =
  "id, lead_id, workspace_id, owner_user_id, mode, sequence_key, step_key, step_index, status, next_eligible_at, baseline_inbound_at, sequence_version, session_date, session_tour_count"

export class SupabaseFollowupStore implements FollowupStore {
  async enrollmentCandidates(sinceIso: string, limit: number): Promise<LeadRow[]> {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select(LEAD_COLUMNS)
      .eq("followup_opt_in", true)
      .eq("sms_opt_in", true)
      .gte("created_at", sinceIso)
      .not("crm_status", "in", "(closed,archived)")
      .limit(limit)
    if (error) {
      console.error("[followup/store] enrollmentCandidates failed:", error.message)
      return []
    }
    return (data ?? []) as unknown as LeadRow[]
  }

  async hasActiveRun(leadId: number): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from("lead_followup_runs")
      .select("id")
      .eq("lead_id", leadId)
      .in("status", ["waiting", "due"])
      .limit(1)
      .maybeSingle()
    return !!data
  }

  async insertRun(run: RunInsert): Promise<boolean> {
    const { error } = await supabaseAdmin.from("lead_followup_runs").insert(run)
    if (error) {
      if (!error.message.includes("lead_followup_runs_one_active")) {
        console.error("[followup/store] insertRun failed:", error.message)
      }
      return false
    }
    return true
  }

  async dueWaitingRuns(nowIso: string, limit: number): Promise<RunRow[]> {
    const { data, error } = await supabaseAdmin
      .from("lead_followup_runs")
      .select(RUN_COLUMNS)
      .eq("status", "waiting")
      .lte("next_eligible_at", nowIso)
      .order("next_eligible_at", { ascending: true })
      .limit(limit)
    if (error) {
      console.error("[followup/store] dueWaitingRuns failed:", error.message)
      return []
    }
    return (data ?? []) as unknown as RunRow[]
  }

  async leadRow(leadId: number): Promise<LeadRow | null> {
    const { data } = await supabaseAdmin.from("leads").select(LEAD_COLUMNS).eq("id", leadId).maybeSingle()
    return (data as unknown as LeadRow) ?? null
  }

  async runById(runId: string): Promise<RunRow | null> {
    const { data } = await supabaseAdmin.from("lead_followup_runs").select(RUN_COLUMNS).eq("id", runId).maybeSingle()
    return (data as unknown as RunRow) ?? null
  }

  async updateRun(runId: string, patch: Record<string, unknown>): Promise<void> {
    await supabaseAdmin.from("lead_followup_runs").update(patch).eq("id", runId)
  }

  async insertIntent(intent: IntentInsert): Promise<"ok" | "duplicate"> {
    const { error } = await supabaseAdmin.from("followup_outbound_intents").insert(intent)
    if (!error) return "ok"
    if (error.message.includes("idempotency_key") || error.message.includes("active_step")) return "duplicate"
    console.error("[followup/store] insertIntent failed:", error.message)
    return "duplicate" // treat any insert failure as non-enqueue; never double-send
  }

  async updateIntent(intentId: string, patch: Record<string, unknown>): Promise<void> {
    await supabaseAdmin.from("followup_outbound_intents").update(patch).eq("id", intentId)
  }

  async pendingIntents(workspaceId: string, limit: number): Promise<IntentRow[]> {
    const { data } = await supabaseAdmin
      .from("followup_outbound_intents")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("dispatch_status", "pending")
      .order("send_not_before", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .limit(limit)
    return (data ?? []) as unknown as IntentRow[]
  }

  async intentById(intentId: string): Promise<IntentRow | null> {
    const { data } = await supabaseAdmin.from("followup_outbound_intents").select("*").eq("id", intentId).maybeSingle()
    return (data as unknown as IntentRow) ?? null
  }

  async latestPendingSendAt(workspaceId: string): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from("followup_outbound_intents")
      .select("send_not_before")
      .eq("workspace_id", workspaceId)
      .in("dispatch_status", ["pending", "claimed"])
      .not("send_not_before", "is", null)
      .order("send_not_before", { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data?.send_not_before as string | null) ?? null
  }

  async leadSnapshot(row: LeadRow): Promise<LeadSnapshot> {
    return buildLeadSnapshot(supabaseAdmin, row)
  }
  async conversation(leadId: number): Promise<ConversationSnapshot> {
    return buildConversationSnapshot(supabaseAdmin, leadId)
  }
  async share(leadId: number): Promise<ShareSnapshot> {
    return buildShareSnapshot(supabaseAdmin, leadId)
  }

  // ── Post Tour wiring ──────────────────────────────────────────────────────
  async enrolledLeadsWithActiveTours(limit: number): Promise<LeadRow[]> {
    const { data: tours } = await supabaseAdmin
      .from("lead_tours")
      .select("lead_id")
      .eq("status", "scheduled")
    const ids = Array.from(new Set((tours ?? []).map((t) => t.lead_id as number)))
    if (ids.length === 0) return []
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select(LEAD_COLUMNS)
      .in("id", ids)
      .eq("followup_opt_in", true)
      .eq("sms_opt_in", true)
      .not("crm_status", "in", "(closed,archived)")
      .limit(limit)
    if (error) {
      console.error("[followup/store] enrolledLeadsWithActiveTours failed:", error.message)
      return []
    }
    return (data ?? []) as unknown as LeadRow[]
  }

  async activeToursForLead(leadId: number): Promise<{ scheduledAt: string; endsAt: string }[]> {
    const { data } = await supabaseAdmin
      .from("lead_tours")
      .select("scheduled_at, ends_at")
      .eq("lead_id", leadId)
      .eq("status", "scheduled")
    return (data ?? []).map((t) => ({
      scheduledAt: t.scheduled_at as string,
      // ends_at is trigger-defaulted; guard anyway.
      endsAt: (t.ends_at as string | null) ?? new Date(new Date(t.scheduled_at as string).getTime() + 60 * 60_000).toISOString(),
    }))
  }

  async activePostTourRunForDate(leadId: number, sessionDate: string): Promise<RunRow | null> {
    const { data } = await supabaseAdmin
      .from("lead_followup_runs")
      .select(RUN_COLUMNS)
      .eq("lead_id", leadId)
      .eq("sequence_key", "post_tour")
      .eq("session_date", sessionDate)
      .in("status", ["waiting", "due"])
      .limit(1)
      .maybeSingle()
    return (data as unknown as RunRow) ?? null
  }

  async postTourRunExistsForDate(leadId: number, sessionDate: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from("lead_followup_runs")
      .select("id")
      .eq("lead_id", leadId)
      .eq("sequence_key", "post_tour")
      .eq("session_date", sessionDate)
      .limit(1)
      .maybeSingle()
    return !!data
  }

  async suppressManualTourFollowUp(leadId: number): Promise<void> {
    // Complete any OPEN manual tour_follow_up so it leaves the Agenda — the
    // automated post_tour run now owns this handoff.
    await supabaseAdmin
      .from("lead_next_actions")
      .update({ completed: true, status: "completed", completed_at: new Date().toISOString() })
      .eq("lead_id", leadId)
      .eq("action_key", "tour_follow_up")
      .eq("status", "open")
  }
}
