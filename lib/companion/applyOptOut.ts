/**
 * EXPLICIT OPT-OUT, APPLIED — the one write path that turns "STOP" into state.
 *
 * The New Lead opening pair ignores ordinary replies on purpose: Text 2 carries
 * the location question and belongs with Text 1. That is only defensible if an
 * explicit opt-out still stops it, and until now nothing in the product ever set
 * `sms_opt_in = false` — the gate's opt-out branch had no producer at all, so a
 * client who replied STOP between the two texts still received the second one.
 *
 * ── WHY THIS RUNS ON BEAST SYNC INBOUND ──────────────────────────────────────
 * This is driven from the Beast Sync ingest route, which is the only live inbound
 * path: it is device-token authenticated, workspace-scoped by the token, and
 * already attributes each message to a lead.
 *
 * It is deliberately NOT wired into app/api/sms/inbound (the Twilio webhook).
 * That endpoint has no signature verification, so anything on the internet can
 * POST to it — wiring an opt-out there would hand an anonymous caller the ability
 * to silence texting for any phone number they can guess. The keyword matcher
 * (lib/messaging/optOut) is shared and ready for it; the webhook needs its
 * signature check first. See the checkpoint report.
 *
 * ── WHAT IT DOES AND DOES NOT TOUCH ──────────────────────────────────────────
 * Sets consent false, cancels the live sequence, and withdraws anything queued.
 * It never deletes or hides a message: the conversation stays readable in full,
 * because an opt-out is a change to what we may SEND, not a reason to lose the
 * client's own words.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { isOptOutMessage, optOutKeyword } from "@/lib/messaging/optOut"

export type OptOutResult = {
  /** Leads whose consent this run turned off. */
  leadIds: number[]
  /** Sequences cancelled, and queued messages withdrawn. */
  runsCanceled: number
  intentsWithdrawn: number
  /** The keyword each lead sent, for the report. */
  keywords: Record<number, string>
}

const EMPTY: OptOutResult = { leadIds: [], runsCanceled: 0, intentsWithdrawn: 0, keywords: {} }

/**
 * Scan this workspace's attributed inbound messages for explicit opt-outs and
 * apply them.
 *
 * Idempotent in the way that matters: re-running cannot re-opt-out a lead who is
 * already off (the consent write is filtered on the current value) and cannot
 * re-cancel a finished run. Re-processing the same message is therefore harmless,
 * which it must be — the Mac re-syncs on every cycle.
 */
export async function applyOptOuts(
  db: SupabaseClient,
  workspaceId: string,
  opts: { messageIds?: string[] } = {},
): Promise<OptOutResult> {
  if (opts.messageIds !== undefined && opts.messageIds.length === 0) return EMPTY

  // Only CLIENT messages can opt out. An outbound message containing the word
  // "stop" is the locator talking, and the automation's own copy could contain it
  // too — so direction is checked here, not left to the keyword matcher.
  let q = db
    .from("companion_messages")
    .select("id, lead_id, body, sent_at")
    .eq("workspace_id", workspaceId)
    .eq("is_from_me", false)
    .not("lead_id", "is", null)
  if (opts.messageIds) q = q.in("id", opts.messageIds)

  const { data: inbound, error } = await q
  if (error) throw new Error(`opt-out: reading inbound failed — ${error.message}`)
  if (!inbound || inbound.length === 0) return EMPTY

  const keywords: Record<number, string> = {}
  for (const m of inbound as Array<{ lead_id: number; body: string | null }>) {
    if (!isOptOutMessage(m.body)) continue
    // Keep the FIRST keyword seen per lead; later ones say the same thing.
    if (keywords[m.lead_id] === undefined) keywords[m.lead_id] = optOutKeyword(m.body) as string
  }
  const leadIds = Object.keys(keywords).map(Number)
  if (leadIds.length === 0) return EMPTY

  // 1. Consent off. Filtered on the current value so an already-opted-out lead is
  //    not rewritten on every sync — and so the returned rows are exactly the
  //    leads this run actually changed.
  const { data: changed, error: leadErr } = await db
    .from("leads")
    .update({ sms_opt_in: false })
    .in("id", leadIds)
    .eq("workspace_id", workspaceId)
    .eq("sms_opt_in", true)
    .select("id")
  if (leadErr) throw new Error(`opt-out: writing consent failed — ${leadErr.message}`)

  // 2. Withdraw anything queued or in flight, so a message cannot slip out
  //    between this write and the gate's next evaluation. This is what actually
  //    stops Text 2 when the client replies STOP inside the 30-45s gap.
  //
  //    'claimed' is included deliberately: the Mac may be holding that job right
  //    now. We cannot recall a text already handed to Messages, but withdrawing
  //    the intent stops the run advancing and stops anything further.
  const { data: withdrawn, error: intentErr } = await db
    .from("followup_outbound_intents")
    .update({ dispatch_status: "superseded", decision_reason: "opt_out" })
    .in("lead_id", leadIds)
    .eq("workspace_id", workspaceId)
    .in("dispatch_status", ["pending", "claimed"])
    .select("id")
  if (intentErr) throw new Error(`opt-out: withdrawing intents failed — ${intentErr.message}`)

  // 3. Cancel the sequences themselves, so no new intent is enqueued next tick.
  const { data: canceled, error: runErr } = await db
    .from("lead_followup_runs")
    .update({ status: "canceled", stop_reason: "opt_out", last_evaluated_at: new Date().toISOString() })
    .in("lead_id", leadIds)
    .eq("workspace_id", workspaceId)
    .in("status", ["waiting", "due"])
    .select("id")
  if (runErr) throw new Error(`opt-out: cancelling runs failed — ${runErr.message}`)

  return {
    leadIds: (changed ?? []).map((r) => r.id as number),
    runsCanceled: (canceled ?? []).length,
    intentsWithdrawn: (withdrawn ?? []).length,
    keywords,
  }
}
