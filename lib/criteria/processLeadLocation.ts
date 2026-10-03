import { supabaseAdmin } from "@/lib/supabase/admin"
import { extractLocationFacts, type ConversationTurn } from "./extractLocationFacts"
import { mayContainLocation, EMPTY_FACTS, type LocationFacts } from "./locationFacts"
import { reconcileLocation, type ReconcileOutcome, type ResolvedDestination } from "./reconcileLocation"
import { resolveDestination } from "./resolveDestination"
import { criteriaChangedMetadata } from "@/lib/leads/criteriaHistory"

/**
 * THE INDEPENDENT CONSUMER — reads stored conversation, may update location
 * criteria, writes nothing else.
 *
 * ── WHAT THIS IS NOT, STRUCTURALLY ──────────────────────────────────────────
 * It is a READER of companion_messages, not a participant in the pipeline that
 * fills it. The existing flow is untouched and unaware of it:
 *
 *     Client → Apple Messages → Beast Sync → companion_messages      (unchanged)
 *                                                  ↓ read-only
 *                                          this consumer
 *                                                  ↓
 *                            leads (4 location columns) + lead_timeline
 *
 * It imports nothing from lib/followup/, nothing from Beast Sync, and nothing
 * from AI Insights. It never updates or deletes a companion_messages row, never
 * moves a cursor, never ACKs, never sends, never enrolls, never touches
 * sms_opt_in or opt-out, and never writes ai_client_briefs. The regression suite
 * asserts each of those as a rule rather than trusting the file to stay this way.
 *
 * ── AUTOMATIC PROCESSING IS OFF ─────────────────────────────────────────────
 * Nothing calls this on a schedule. There is no cron route and no hook in any
 * message path; it runs only when invoked deliberately. Activation is a separate,
 * approved step — see AUTO_PROCESSING_ENABLED.
 *
 * ── IDEMPOTENCY: companion_messages.criteria_scanned_at ─────────────────────
 * The processing ledger is one nullable timestamp on the message itself. NULL
 * means "not yet examined"; a value means this consumer FINISHED with it, and it
 * is skipped before any model call.
 *
 * SCANNED MEANS FINISHED, NOT ATTEMPTED. The stamp is written only after the
 * required work succeeded — including the lead update and the Client History
 * write when a change occurred. Any failure (model, Places, update, history)
 * leaves it NULL so the message is retried. Stamping earlier would silently drop
 * a client's stated requirement on the first transient error.
 *
 * It is stamped for every SUCCESSFUL outcome, not just changes: identical to
 * current criteria, ambiguous, needs-review and "stated nothing" are all finished
 * work, and re-sending them to the model would be pure waste.
 *
 * WHY NOT THE CLIENT HISTORY GUID. Dedupe was previously derived from the
 * evidence guid on each criteria_changed event. That only records messages that
 * CHANGED something, so a message examined and found to state nothing would be
 * re-sent to the model forever. Client History is an audit record of what
 * actually changed, not a processing ledger; conflating the two answers the wrong
 * question. The evidence guid REMAINS on the event for audit — it is simply no
 * longer what decides whether work happens.
 */

/**
 * MASTER SWITCH for automatic processing. OFF until explicitly activated.
 *
 * This is not the only thing keeping production quiet — nothing schedules this
 * module at all — but it means a future caller added by mistake still does
 * nothing until someone deliberately flips it.
 */
export const AUTO_PROCESSING_ENABLED = false

/** Newest inbound messages considered in one run. */
export const MAX_MESSAGES_PER_RUN = 25

export type MessageOutcome = {
  guid: string
  sentAt: string | null
  body: string
  /** Why this message ended where it did — the log/report vocabulary. */
  status:
    | "already_processed"
    | "skipped_no_location_language"
    | "no_facts_extracted"
    | "no_change"
    | "needs_review"
    | "applied"
  facts?: LocationFacts
  outcome?: ReconcileOutcome
  resolved?: ResolvedDestination | null
  notes: string[]
}

export type ProcessSummary = {
  leadId: number
  considered: number
  applied: number
  needsReview: number
  skipped: number
  /** True when nothing was written because the caller asked for a dry run. */
  dryRun: boolean
  messages: MessageOutcome[]
}

type MessageRow = { guid: string; body: string | null; is_from_me: boolean; sent_at: string | null; criteria_scanned_at: string | null }

/**
 * Examine a lead's recent inbound messages and apply any explicit location
 * criteria they state.
 *
 * `dryRun` computes everything — extraction, resolution, reconciliation — and
 * writes NOTHING. That is the mode V1 is tested in.
 */
export async function processLeadLocation(
  leadId: number,
  opts: { dryRun?: boolean; limit?: number } = {},
): Promise<ProcessSummary> {
  const dryRun = opts.dryRun ?? true // safe default: callers must opt IN to writing
  const summary: ProcessSummary = { leadId, considered: 0, applied: 0, needsReview: 0, skipped: 0, dryRun, messages: [] }

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("id, neighborhoods, submarkets, commute_anchor_label, commute_anchor_place_id, commute_max_minutes")
    .eq("id", leadId)
    .maybeSingle()
  if (leadErr || !lead) {
    console.error(`[criteria] lead ${leadId} not readable:`, leadErr?.message ?? "not found")
    return summary
  }

  // Message text and the ledger column are READ here; body/guid/sent_at are never
  // written back — only criteria_scanned_at is ever stamped, and only on success.
  const { data: rows, error: msgErr } = await supabaseAdmin
    .from("companion_messages")
    .select("guid, body, is_from_me, sent_at, criteria_scanned_at")
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: false })
    .limit(opts.limit ?? MAX_MESSAGES_PER_RUN)
  if (msgErr) {
    console.error(`[criteria] lead ${leadId} messages not readable:`, msgErr.message)
    return summary
  }

  // Oldest → newest, so an earlier statement is already applied when a later one
  // is reconciled against the lead's criteria.
  const messages = ((rows ?? []) as MessageRow[]).slice().reverse()

  // A local copy of the criteria, advanced as statements are applied, so two
  // messages in one run reconcile against the right state.
  const working: Record<string, unknown> = { ...lead }

  for (const m of messages) {
    if (m.is_from_me) continue // only what the CLIENT said
    summary.considered++
    const body = String(m.body ?? "").trim()
    const base = { guid: m.guid, sentAt: m.sent_at, body }

    // THE LEDGER GUARD — before the pre-filter and long before any model call.
    if (m.criteria_scanned_at) {
      summary.skipped++
      summary.messages.push({ ...base, status: "already_processed", notes: ["idempotent_skip"] })
      continue
    }
    if (!mayContainLocation(body)) {
      // Examined and found to contain no location language. That is a finished,
      // successful outcome, so it is stamped — otherwise every future run would
      // re-examine it forever, which is the whole reason the ledger exists.
      summary.skipped++
      if (!dryRun) await markScanned(m.guid)
      summary.messages.push({ ...base, status: "skipped_no_location_language", notes: ["prefilter", ...(dryRun ? [] : ["scanned"])] })
      continue
    }

    // Context = the turns immediately before this message, so a one-line answer
    // can be read against the question that prompted it.
    const idx = messages.findIndex((x) => x.guid === m.guid)
    const context: ConversationTurn[] = messages
      .slice(Math.max(0, idx - 4), idx)
      .map((t) => ({ fromMe: t.is_from_me, body: String(t.body ?? "") }))
      .filter((t) => t.body.trim().length > 0)

    let facts: LocationFacts = EMPTY_FACTS
    try {
      facts = await extractLocationFacts(body, context)
    } catch (e) {
      // FAILURE — deliberately NOT stamped, so this message is retried.
      console.error(`[criteria] extraction failed for ${m.guid}:`, e instanceof Error ? e.message : "unknown")
      summary.skipped++
      summary.messages.push({ ...base, status: "no_facts_extracted", notes: ["extraction_error", "left_unscanned"] })
      continue
    }

    const statedSomething =
      facts.areas.length > 0 || !!facts.destination || !!facts.maxDriveMinutes
    if (!statedSomething) {
      // Successfully examined; the client stated nothing about location. Finished.
      summary.skipped++
      if (!dryRun) await markScanned(m.guid)
      summary.messages.push({ ...base, status: "no_facts_extracted", facts, notes: ["nothing_stated", ...(dryRun ? [] : ["scanned"])] })
      continue
    }

    // Resolve only an EXPLICIT destination — an ambiguous one is never written,
    // so there is no reason to spend a Places call on it.
    let resolved: ResolvedDestination | null = null
    const resolveNotes: string[] = []
    let resolverFailed = false
    if (facts.destination && facts.destination.confidence === "explicit") {
      const r = await resolveDestination(facts.destination.name)
      if (r.status === "resolved") resolved = r.destination
      else {
        resolveNotes.push(`destination_${r.status}`)
        // `unavailable` is an INFRASTRUCTURE failure (no key, network, 5xx), not a
        // verdict about the client's words — retry it. `ambiguous`/`not_found` are
        // real answers: we examined it and cannot safely act, which is finished.
        if (r.status === "unavailable") resolverFailed = true
      }
    }
    if (resolverFailed) {
      summary.needsReview++
      summary.messages.push({ ...base, status: "needs_review", facts, resolved, notes: [...resolveNotes, "left_unscanned"] })
      continue
    }

    const outcome = reconcileLocation({ lead: working, facts, resolvedDestination: resolved })
    const notes = [...outcome.notes, ...resolveNotes]

    // Examined successfully, but nothing to apply — identical to current criteria,
    // ambiguous, or needing review. All finished work, so all stamped.
    if (outcome.changes.length === 0) {
      if (outcome.needsReview) summary.needsReview++
      else summary.skipped++
      if (!dryRun) await markScanned(m.guid)
      summary.messages.push({
        ...base,
        status: outcome.needsReview ? "needs_review" : "no_change",
        facts, outcome, resolved, notes: [...notes, ...(dryRun ? [] : ["scanned"])],
      })
      continue
    }

    if (dryRun) {
      // ZERO mutations: no lead update, no history, no stamp.
      summary.applied++
      Object.assign(working, outcome.patch)
      summary.messages.push({ ...base, status: "applied", facts, outcome, resolved, notes: [...notes, "dry_run_not_written"] })
      continue
    }

    const { error: updErr } = await supabaseAdmin.from("leads").update(outcome.patch).eq("id", leadId)
    if (updErr) {
      // Left UNSCANNED on purpose — the client's statement has not been applied.
      console.error(`[criteria] lead ${leadId} update failed:`, updErr.message)
      summary.messages.push({ ...base, status: "no_change", facts, outcome, resolved, notes: [...notes, "update_failed", "left_unscanned"] })
      continue
    }

    // ONE history event for this ONE client statement, carrying every change it
    // caused. The evidence guid stays here for AUDIT; the ledger column, not this,
    // is what decides whether the message is processed again.
    const metadata = criteriaChangedMetadata("conversation", outcome.changes)
    const { error: histErr } = await supabaseAdmin.from("lead_timeline").insert([{
      lead_id: leadId,
      type: "criteria_changed",
      // Only the client's own words and the message identity — never the
      // surrounding transcript.
      metadata: { ...metadata, evidence: { guid: m.guid, text: facts.evidence || body, sent_at: m.sent_at } },
    }])
    if (histErr) {
      // The lead moved but its history did not. Left UNSCANNED so the next run
      // retries; reconciliation is a no-op by then, which re-stamps cleanly
      // without duplicating the lead change.
      console.error(`[criteria] history write failed for ${m.guid}:`, histErr.message)
      Object.assign(working, outcome.patch)
      summary.applied++
      summary.messages.push({ ...base, status: "applied", facts, outcome, resolved, notes: [...notes, "history_failed", "left_unscanned"] })
      continue
    }

    // Only NOW is this message finished.
    await markScanned(m.guid)
    Object.assign(working, outcome.patch)
    summary.applied++
    summary.messages.push({ ...base, status: "applied", facts, outcome, resolved, notes: [...notes, "scanned"] })
  }

  return summary
}

/**
 * Stamp one message as finished. Writes ONLY criteria_scanned_at — body, guid,
 * lead_id, sent_at and every other column are untouched, so Beast Sync's view of
 * the row is unchanged.
 *
 * Never throws: a failed stamp leaves the row NULL, which means the message is
 * re-examined later. That is wasteful, not harmful — the opposite mistake, a
 * stamp that lands when the work did not, loses the client's requirement
 * permanently.
 */
async function markScanned(guid: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("companion_messages")
    .update({ criteria_scanned_at: new Date().toISOString() })
    .eq("guid", guid)
  if (error) console.error(`[criteria] could not stamp ${guid}:`, error.message)
}
