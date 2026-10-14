import { supabaseAdmin } from "@/lib/supabase/admin"
import { extractLocationFacts } from "./extractLocationFacts"
import { mayContainLocation } from "./locationFacts"
import { reconcileLocation, type ResolvedDestination } from "./reconcileLocation"
import { resolveDestination } from "./resolveDestination"
import { hasExplicitDestination, narrowCommutePatch } from "./notesPatchRules"

// SMART LEAD FORM NOTES → structured commute destination.
//
// ── WHAT THIS IS ────────────────────────────────────────────────────────────────────────────
// A second INPUT to the location pipeline that already exists, not a second pipeline. It reuses
// extractLocationFacts → resolveDestination → reconcileLocation unchanged, so every rule those
// already enforce applies here for free:
//
//   • ambiguous never writes            • a destination is NEVER an area
//   • no invented maximum               • an unresolved destination writes nothing
//   • never delete on mention           • two desired areas, hard
//
// The sibling processLeadLocation reads companion_messages (the client's texts). This reads the
// ONE note a renter typed on the form. Same rules, different sentence.
//
// ── WHY IT CANNOT BREAK A SUBMISSION ────────────────────────────────────────────────────────
// It is called from `after()` and never throws. A renter's lead, their confirmation email and the
// CRM record are all already written by the time this runs; a model outage, a Places failure or a
// malformed note must leave every one of them intact. Failure here means "no destination was
// extracted", which is exactly the state a lead without a note is in anyway.
//
// ── IDEMPOTENT, AND IT NEVER OVERWRITES A PERSON ────────────────────────────────────────────
// It runs once per new lead, and writes ONLY into empty columns: if an agent or the renter has
// already set a destination, areas or a maximum, this leaves them alone. Re-running it changes
// nothing, because by then the fields are populated.

export type NotesLocationOutcome = {
  wrote: boolean
  reason:
    | "ok"
    | "no_notes"
    | "no_location_hint"
    | "nothing_extracted"
    | "destination_unresolved"
    | "already_set"
    | "no_patch"
    | "error"
  label?: string
}

/**
 * Extract a commute destination from a new lead's form notes.
 *
 * Returns what happened rather than throwing, so the caller can log one line and move on.
 */
export async function processNotesLocation(opts: {
  leadId: number | string
  notes: string | null | undefined
}): Promise<NotesLocationOutcome> {
  const { leadId } = opts
  const notes = (opts.notes ?? "").trim()
  try {
    if (!notes) return { wrote: false, reason: "no_notes" }
    // Cost filter only — it decides whether a model call is worth making, never whether a result
    // is safe. "Looking forward to hearing from you" never reaches the model.
    if (!mayContainLocation(notes)) return { wrote: false, reason: "no_location_hint" }

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, neighborhoods, submarkets, commute_anchor_label, commute_anchor_place_id, commute_max_minutes")
      .eq("id", leadId)
      .maybeSingle()
    if (!lead) return { wrote: false, reason: "error" }

    // NEVER OVERWRITE A PERSON. A destination already on the lead was put there by the renter's
    // own form selection or by the agent; a sentence in the notes does not get to replace it.
    if (hasExplicitDestination(lead)) return { wrote: false, reason: "already_set" }

    const facts = await extractLocationFacts(notes)
    if (!facts.destination && facts.areas.length === 0 && facts.maxDriveMinutes == null) {
      return { wrote: false, reason: "nothing_extracted" }
    }

    // A destination is only usable with a canonical place id — Commute Mode routes from it.
    // Ambiguity here is a refusal, unchanged: resolveDestination returns null and reconciliation
    // then writes no anchor.
    let resolved: ResolvedDestination | null = null
    if (facts.destination) {
      const r = await resolveDestination(facts.destination.name)
      if (r.status === "resolved") resolved = r.destination
    }
    if (facts.destination && !resolved) return { wrote: false, reason: "destination_unresolved" }

    const outcome = reconcileLocation({ lead, facts, resolvedDestination: resolved })

    // NARROWED TO THE COMMUTE COLUMNS. Reconciliation can also propose desired areas; from a form
    // note we deliberately take only the destination, so a passing mention can never rewrite the
    // areas the renter explicitly chose in the form's own fields.
    // See notesPatchRules: commute columns only, blanks only, and never a maximum without the
    // anchor it belongs to.
    const patch = narrowCommutePatch(lead, outcome.patch)
    if (Object.keys(patch).length === 0) return { wrote: false, reason: "no_patch" }

    const { error } = await supabaseAdmin.from("leads").update(patch).eq("id", leadId)
    if (error) return { wrote: false, reason: "error" }

    return { wrote: true, reason: "ok", label: String(patch.commute_anchor_label ?? "") || undefined }
  } catch {
    // Deliberately silent to the caller: the renter's submission already succeeded.
    return { wrote: false, reason: "error" }
  }
}
