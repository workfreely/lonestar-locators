// Follow-Up Agent — IN-MEMORY store for the dry-run simulator (TEST ONLY).
//
// Implements the same FollowupStore the production engine uses, backed by maps and
// a VIRTUAL clock instead of Supabase. It faithfully reproduces the two DB
// uniqueness guards that make idempotency real:
//   • global unique idempotency_key (non-null)
//   • unique (run_id, step_key) while dispatch_status ∈ {pending,claimed,sent}
// so "duplicate tick / claim / ack" and "no double-send" are genuinely tested.
//
// It has NO network and NO transport — it cannot reach Apple Messages, Beast Sync,
// or any real endpoint. The simulator plays the device by calling runClaim/runAck.

import type { ConversationSnapshot, LeadSnapshot, ShareSnapshot } from "../types"
import type { LeadRow, RunRow } from "../snapshot"
import type { FollowupStore, IntentInsert, IntentRow, RunInsert } from "../store"

export type SeedLead = LeadRow & {
  agentFirstName: string | null
  timeZone: string
  accountAuthorized: boolean
}

type StoredRun = RunRow & { stop_reason?: string | null; last_evaluated_at?: string | null; _seq: number }
type StoredIntent = IntentRow & { _seq: number }

function monthLabel(moveDate: string | null): string | null {
  if (!moveDate) return null
  const d = new Date(moveDate.length <= 10 ? `${moveDate}T00:00:00Z` : moveDate)
  if (isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long" }).format(d)
}

export class InMemoryFollowupStore implements FollowupStore {
  private leads = new Map<number, SeedLead>()
  private convs = new Map<number, ConversationSnapshot>()
  private shares = new Map<number, ShareSnapshot>()
  runs = new Map<string, StoredRun>()
  intents = new Map<string, StoredIntent>()
  private tours = new Map<number, { scheduledAt: string; endsAt: string; status: string }[]>()
  manualTourFU = new Set<number>() // leads with an OPEN manual tour_follow_up action
  private runSeq = 0
  private intentSeq = 0
  private seqCounter = 0

  constructor(private clock: () => Date) {}

  // Sim seeding for tours + the manual handoff action.
  putTours(leadId: number, tours: { scheduledAt: string; endsAt: string; status?: string }[]) {
    this.tours.set(leadId, tours.map((t) => ({ scheduledAt: t.scheduledAt, endsAt: t.endsAt, status: t.status ?? "scheduled" })))
  }
  setManualTourFollowUp(leadId: number, open: boolean) {
    if (open) this.manualTourFU.add(leadId)
    else this.manualTourFU.delete(leadId)
  }
  hasManualTourFollowUp(leadId: number): boolean {
    return this.manualTourFU.has(leadId)
  }

  // ── Sim seeding / inspection (not part of FollowupStore) ──────────────────
  putLead(lead: SeedLead) {
    this.leads.set(lead.id, lead)
    if (!this.convs.has(lead.id)) this.convs.set(lead.id, { lastInboundAt: null, lastManualOutboundAt: null })
    if (!this.shares.has(lead.id))
      this.shares.set(lead.id, { sentAt: null, doneSelectingAt: null, favoritedCount: 0, availabilitySubmittedAt: null })
  }
  patchLead(id: number, patch: Partial<SeedLead>) {
    const l = this.leads.get(id); if (l) this.leads.set(id, { ...l, ...patch })
  }
  setConversation(id: number, c: Partial<ConversationSnapshot>) {
    this.convs.set(id, { ...(this.convs.get(id) ?? { lastInboundAt: null, lastManualOutboundAt: null }), ...c })
  }
  setShare(id: number, s: Partial<ShareSnapshot>) {
    this.shares.set(id, {
      ...(this.shares.get(id) ?? { sentAt: null, doneSelectingAt: null, favoritedCount: 0, availabilitySubmittedAt: null }),
      ...s,
    })
  }
  activeRunForLead(leadId: number): StoredRun | null {
    for (const r of this.runs.values()) if (r.lead_id === leadId && (r.status === "waiting" || r.status === "due")) return r
    return null
  }
  runForLead(leadId: number): StoredRun | null {
    let latest: StoredRun | null = null
    for (const r of this.runs.values()) if (r.lead_id === leadId) if (!latest || r._seq > latest._seq) latest = r
    return latest
  }
  intentsForLead(leadId: number): StoredIntent[] {
    return [...this.intents.values()].filter((i) => i.lead_id === leadId).sort((a, b) => a._seq - b._seq)
  }

  // ── FollowupStore ─────────────────────────────────────────────────────────
  async enrollmentCandidates(sinceIso: string, limit: number): Promise<LeadRow[]> {
    const since = new Date(sinceIso).getTime()
    const out: LeadRow[] = []
    for (const l of this.leads.values()) {
      if (l.followup_opt_in !== true) continue
      if (l.sms_opt_in !== true) continue
      if (!l.created_at || new Date(l.created_at).getTime() < since) continue
      if (l.crm_status === "closed" || l.crm_status === "archived") continue
      out.push(l)
      if (out.length >= limit) break
    }
    return out
  }

  async hasActiveRun(leadId: number): Promise<boolean> {
    return this.activeRunForLead(leadId) != null
  }

  async insertRun(run: RunInsert): Promise<boolean> {
    // Mirror the DB partial-unique indexes: lifecycle runs (session_date null) are
    // one-active-per-lead; event sessions are one-active per (lead, seq, date).
    const sessionDate = run.session_date ?? null
    for (const r of this.runs.values()) {
      if (r.lead_id !== run.lead_id || (r.status !== "waiting" && r.status !== "due")) continue
      const rDate = r.session_date ?? null
      if (sessionDate === null && rDate === null) return false // lifecycle one-active
      if (sessionDate !== null && rDate === sessionDate && r.sequence_key === run.sequence_key) return false // per-date one-active
    }
    const id = `run_${++this.runSeq}`
    this.runs.set(id, { id, ...run, session_date: sessionDate, session_tour_count: run.session_tour_count ?? null, _seq: ++this.seqCounter } as StoredRun)
    return true
  }

  async dueWaitingRuns(nowIso: string, limit: number): Promise<RunRow[]> {
    const now = new Date(nowIso).getTime()
    return [...this.runs.values()]
      .filter((r) => r.status === "waiting" && r.next_eligible_at != null && new Date(r.next_eligible_at).getTime() <= now)
      .sort((a, b) => new Date(a.next_eligible_at!).getTime() - new Date(b.next_eligible_at!).getTime() || a._seq - b._seq)
      .slice(0, limit)
  }

  async leadRow(leadId: number): Promise<LeadRow | null> {
    return this.leads.get(leadId) ?? null
  }
  async runById(runId: string): Promise<RunRow | null> {
    return this.runs.get(runId) ?? null
  }
  async updateRun(runId: string, patch: Record<string, unknown>): Promise<void> {
    const r = this.runs.get(runId); if (r) this.runs.set(runId, { ...r, ...patch } as StoredRun)
  }

  async insertIntent(intent: IntentInsert): Promise<"ok" | "duplicate"> {
    // global unique idempotency_key (non-null)
    if (intent.idempotency_key != null) {
      for (const i of this.intents.values()) if (i.idempotency_key === intent.idempotency_key) return "duplicate"
    }
    // unique (run_id, step_key) while active
    for (const i of this.intents.values()) {
      if (i.run_id === intent.run_id && i.step_key === intent.step_key && ["pending", "claimed", "sent"].includes(i.dispatch_status))
        return "duplicate"
    }
    const id = `intent_${++this.intentSeq}`
    const { evaluated_state, ...rest } = intent
    void evaluated_state
    this.intents.set(id, {
      id,
      ...rest,
      send_not_before: intent.send_not_before ?? null,
      gateway_device_id: null,
      claimed_at: null,
      sent_at: null,
      local_sent_at: null,
      error: null,
      created_at: this.clock().toISOString(),
      _seq: ++this.seqCounter,
    } as StoredIntent)
    return "ok"
  }

  async updateIntent(intentId: string, patch: Record<string, unknown>): Promise<void> {
    const i = this.intents.get(intentId); if (i) this.intents.set(intentId, { ...i, ...patch } as StoredIntent)
  }

  /** Mirrors the conditional UPDATE: only a still-pending intent can be claimed. */
  async claimIntent(intentId: string, patch: Record<string, unknown>): Promise<boolean> {
    const i = this.intents.get(intentId)
    if (!i || i.dispatch_status !== "pending") return false
    this.intents.set(intentId, { ...i, ...patch } as StoredIntent)
    return true
  }

  async pendingIntents(workspaceId: string, limit: number): Promise<IntentRow[]> {
    const key = (i: StoredIntent) => (i.send_not_before ? new Date(i.send_not_before).getTime() : new Date(i.created_at).getTime())
    return [...this.intents.values()]
      .filter((i) => i.workspace_id === workspaceId && i.dispatch_status === "pending")
      .sort((a, b) => key(a) - key(b) || a._seq - b._seq)
      .slice(0, limit)
  }
  async intentById(intentId: string): Promise<IntentRow | null> {
    return this.intents.get(intentId) ?? null
  }

  async latestPendingSendAt(workspaceId: string): Promise<string | null> {
    let max: number | null = null
    let iso: string | null = null
    for (const i of this.intents.values()) {
      if (i.workspace_id !== workspaceId) continue
      if (i.dispatch_status !== "pending" && i.dispatch_status !== "claimed") continue
      if (!i.send_not_before) continue
      const t = new Date(i.send_not_before).getTime()
      if (max === null || t > max) { max = t; iso = i.send_not_before }
    }
    return iso
  }

  async leadSnapshot(row: LeadRow): Promise<LeadSnapshot> {
    const l = this.leads.get(row.id)
    return {
      id: row.id,
      firstName: row.first_name,
      agentFirstName: l?.agentFirstName ?? null,
      beds: row.beds,
      propertyType: row.property_type,
      moveDate: row.move_date,
      moveMonthLabel: monthLabel(row.move_date),
      crmStatus: row.crm_status,
      smsOptIn: row.sms_opt_in === true,
      accountAuthorized: l?.accountAuthorized === true,
      followupOptIn: row.followup_opt_in === true,
      appliedAt: row.applied_at,
      timeZone: l?.timeZone ?? "America/Chicago",
    }
  }
  async conversation(leadId: number): Promise<ConversationSnapshot> {
    return this.convs.get(leadId) ?? { lastInboundAt: null, lastManualOutboundAt: null }
  }
  async share(leadId: number): Promise<ShareSnapshot> {
    return this.shares.get(leadId) ?? { sentAt: null, doneSelectingAt: null, favoritedCount: 0, availabilitySubmittedAt: null }
  }

  // ── Post Tour wiring ──────────────────────────────────────────────────────
  async enrolledLeadsWithActiveTours(limit: number): Promise<LeadRow[]> {
    const out: LeadRow[] = []
    for (const l of this.leads.values()) {
      if (l.followup_opt_in !== true || l.sms_opt_in !== true) continue
      if (l.crm_status === "closed" || l.crm_status === "archived") continue
      if ((this.tours.get(l.id) ?? []).some((t) => t.status === "scheduled")) out.push(l)
      if (out.length >= limit) break
    }
    return out
  }
  async activeToursForLead(leadId: number): Promise<{ scheduledAt: string; endsAt: string }[]> {
    return (this.tours.get(leadId) ?? []).filter((t) => t.status === "scheduled").map((t) => ({ scheduledAt: t.scheduledAt, endsAt: t.endsAt }))
  }
  async activePostTourRunForDate(leadId: number, sessionDate: string): Promise<RunRow | null> {
    for (const r of this.runs.values()) {
      if (r.lead_id === leadId && r.sequence_key === "post_tour" && r.session_date === sessionDate && (r.status === "waiting" || r.status === "due")) return r
    }
    return null
  }
  async postTourRunExistsForDate(leadId: number, sessionDate: string): Promise<boolean> {
    for (const r of this.runs.values()) {
      if (r.lead_id === leadId && r.sequence_key === "post_tour" && r.session_date === sessionDate) return true
    }
    return false
  }
  async suppressManualTourFollowUp(leadId: number): Promise<void> {
    this.manualTourFU.delete(leadId)
  }
}
