/**
 * BEAST SYNC ATTRIBUTION — which lead does this message belong to?
 *
 * ONE code path serves both moments a message can become attributed:
 *   • ingest        — a message arrives and a lead already has that number
 *   • late addition — the lead's number is added or corrected afterwards
 * They are the same question asked at different times, so they must not be two
 * implementations that can disagree. Ingest stores messages and then calls this;
 * saving a phone number calls exactly the same function.
 *
 * ── THE RULES, AND WHY ───────────────────────────────────────────────────────
 *
 * 1. IDENTITY IS E.164, NEVER THE LAST TEN DIGITS. `slice(-10)` turned the London
 *    number +44 20 7946 0958 into 2079460958 — area code 207, Maine. See
 *    lib/phone/identity.ts.
 *
 * 2. SAME WORKSPACE ONLY. Workspaces are separate businesses that can legitimately
 *    share a client. Every query is workspace-scoped; nothing crosses.
 *
 * 3. LIVE LEADS ONLY. The previous implementation never filtered deleted_at, so a
 *    soft-deleted lead could capture a live lead's conversation — and production
 *    holds exactly that shape: two leads share 2105550199 and one is deleted.
 *
 * 4. UNAMBIGUOUS ONLY. If two live leads in one workspace hold the same identity,
 *    we attribute to NEITHER and record "ambiguous". The old rule took whichever
 *    row the database happened to return first (`!map.has(key)`, no ORDER BY) —
 *    an arbitrary choice between two real people's conversations.
 *
 * 5. NEVER MOVE AN ATTRIBUTED MESSAGE. Only rows with lead_id IS NULL are ever
 *    written. A re-sync of the same message, or a later phone change, can fill a
 *    blank — it can never silently relocate history from one lead to another. This
 *    is also what makes re-running it idempotent.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { toE164 } from "@/lib/phone/identity"

/** Mirrors companion_messages.attribution_status (migration 20261012). */
export type AttributionStatus = "attributed" | "no_match" | "ambiguous" | "ineligible"

export type UnattributedMessage = { id: string; phone_e164: string | null }
export type CandidateLead = { id: number; phone_e164: string | null }

export type AttributionDecision = {
  messageId: string
  leadId: number | null
  status: AttributionStatus
  /** The identities this message's number matched, when more than one. */
  conflictingLeadIds?: number[]
}

/**
 * The decision itself — pure, so every rule above is testable without a database.
 *
 * `leads` must already be scoped to the message's workspace and to live rows; this
 * function cannot verify that, so the callers below are the only ones that build
 * the list. Passing an unscoped list would violate rules 2 and 3 silently, which
 * is why the DB query lives next to it in this file rather than at the call sites.
 */
export function decideAttribution(
  messages: UnattributedMessage[],
  leads: CandidateLead[],
): AttributionDecision[] {
  // identity → every live lead holding it. Built as a list, not a first-wins map,
  // precisely so a collision is visible rather than silently resolved.
  const byIdentity = new Map<string, number[]>()
  for (const lead of leads) {
    if (!lead.phone_e164) continue
    const existing = byIdentity.get(lead.phone_e164)
    if (existing) existing.push(lead.id)
    else byIdentity.set(lead.phone_e164, [lead.id])
  }

  return messages.map((m) => {
    // No usable identity: an e-mail iMessage handle, a shortcode, or a foreign
    // number. Not a failure — there is simply nothing it could identify.
    if (!m.phone_e164) return { messageId: m.id, leadId: null, status: "ineligible" as const }

    const matches = byIdentity.get(m.phone_e164)
    if (!matches || matches.length === 0) {
      return { messageId: m.id, leadId: null, status: "no_match" as const }
    }
    if (matches.length > 1) {
      // Rule 4. Deliberately unattributed, and recorded so it can be surfaced.
      return {
        messageId: m.id,
        leadId: null,
        status: "ambiguous" as const,
        conflictingLeadIds: [...matches].sort((a, b) => a - b),
      }
    }
    return { messageId: m.id, leadId: matches[0], status: "attributed" as const }
  })
}

export type AttributionResult = {
  attributed: number
  no_match: number
  ambiguous: number
  ineligible: number
  /** Identity → the live leads sharing it. Non-empty means a human should look. */
  conflicts: Array<{ phoneE164: string; leadIds: number[] }>
}

const EMPTY: AttributionResult = { attributed: 0, no_match: 0, ambiguous: 0, ineligible: 0, conflicts: [] }

/**
 * Attribute the unattributed messages of one workspace.
 *
 * `identities` narrows the scan to specific E.164 numbers — the batch just
 * ingested, or the one number a locator just saved. Omit it to sweep the whole
 * workspace (the backfill case). An EMPTY array means "nothing to look at" and
 * returns immediately; this distinction matters, because treating an empty list
 * as "no filter" would turn a no-op into a full workspace scan.
 *
 * Safe to call repeatedly: it only ever reads lead_id IS NULL rows and only ever
 * writes rows that are still NULL at write time.
 */
export async function attributeUnattributedMessages(
  db: SupabaseClient,
  workspaceId: string,
  opts: { identities?: string[] } = {},
): Promise<AttributionResult> {
  if (opts.identities !== undefined && opts.identities.length === 0) return EMPTY

  let q = db
    .from("companion_messages")
    .select("id, phone_e164")
    .eq("workspace_id", workspaceId)
    .is("lead_id", null)
  if (opts.identities !== undefined) q = q.in("phone_e164", opts.identities)

  const { data: messages, error: msgErr } = await q
  if (msgErr) throw new Error(`attribution: reading messages failed — ${msgErr.message}`)
  if (!messages || messages.length === 0) return EMPTY

  const identities = Array.from(
    new Set((messages as UnattributedMessage[]).map((m) => m.phone_e164).filter((p): p is string => !!p)),
  )

  // Rules 2 + 3, and `.in()` on the identities so this reads only the leads that
  // could match rather than every lead in the workspace, as the old path did.
  let leads: CandidateLead[] = []
  if (identities.length > 0) {
    const { data, error } = await db
      .from("leads")
      .select("id, phone_e164")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .in("phone_e164", identities)
    if (error) throw new Error(`attribution: reading leads failed — ${error.message}`)
    leads = (data ?? []) as CandidateLead[]
  }

  const decisions = decideAttribution(messages as UnattributedMessage[], leads)

  // Group by outcome so this is a handful of updates rather than one per message.
  const groups = new Map<string, { leadId: number | null; status: AttributionStatus; ids: string[] }>()
  for (const d of decisions) {
    const key = `${d.status}:${d.leadId ?? ""}`
    const g = groups.get(key)
    if (g) g.ids.push(d.messageId)
    else groups.set(key, { leadId: d.leadId, status: d.status, ids: [d.messageId] })
  }

  for (const g of groups.values()) {
    // `.is("lead_id", null)` again: between the read above and this write, an
    // ingest batch may have attributed the same row. Re-asserting it here is what
    // upholds rule 5 under concurrency — without it, two overlapping runs could
    // move a message that had just been attributed.
    const { error } = await db
      .from("companion_messages")
      .update({ lead_id: g.leadId, attribution_status: g.status })
      .in("id", g.ids)
      .is("lead_id", null)
    if (error) throw new Error(`attribution: writing ${g.status} failed — ${error.message}`)
  }

  const result: AttributionResult = {
    attributed: decisions.filter((d) => d.status === "attributed").length,
    no_match: decisions.filter((d) => d.status === "no_match").length,
    ambiguous: decisions.filter((d) => d.status === "ambiguous").length,
    ineligible: decisions.filter((d) => d.status === "ineligible").length,
    conflicts: [],
  }

  const seen = new Set<string>()
  for (const d of decisions) {
    if (d.status !== "ambiguous" || !d.conflictingLeadIds) continue
    const msg = (messages as UnattributedMessage[]).find((m) => m.id === d.messageId)
    const identity = msg?.phone_e164
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    result.conflicts.push({ phoneE164: identity, leadIds: d.conflictingLeadIds })
  }

  return result
}

/**
 * Called after a lead's phone number is written — the late-addition requirement:
 * a lead can exist with no phone, messages can arrive and sit unattributed, and
 * adding the number later must connect them.
 *
 * Only ever fills blanks (rule 5), so a phone CHANGE does not drag the previous
 * number's history onto the new one. Messages already attributed to this lead
 * under its old number stay where they are; if that is wrong, it is a human
 * decision, not something to do silently.
 *
 * Returns null when the number cannot be an identity, so callers can tell "no
 * work to do" from "did work".
 */
export async function reattributeForLeadPhone(
  db: SupabaseClient,
  workspaceId: string,
  rawPhone: string | null | undefined,
): Promise<AttributionResult | null> {
  const identity = toE164(rawPhone)
  if (!identity) return null
  return attributeUnattributedMessages(db, workspaceId, { identities: [identity] })
}
