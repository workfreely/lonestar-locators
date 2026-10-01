import { NextResponse } from "next/server"
import { google } from "googleapis"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { buildContactNotes } from "@/lib/google/buildContactNotes"
import { updateGoogleContactNotes } from "@/lib/google/updateContactNotes"
// LEGACY global Google account — TODO(phase-2): migrate the contacts + calendar
// side-effects below to per-user google_credentials. See getOAuthClient.ts.
import { getOAuthClient } from "@/lib/google/getOAuthClient"
import { createListSentCalendarEvent } from "@/lib/google/createCalendarEvent"
import { getStageWorkflowAction, createWorkflowActionIfNeeded } from "@/lib/workflowEngine"
import { CONTACT_CHASE_ACTION_KEYS, STAGES_PAST_CONTACT_CHASE } from "@/lib/leads/contactChase"
import { LIST_LADDER_ACTION_KEYS, STAGES_PAST_LIST_LADDER } from "@/lib/leads/actionCompletion"
import { resolveUserTimeZone } from "@/lib/timezone/server"
import { resolveWorkHoursFromProfile } from "@/lib/workflow/autoDueDate"
import {
  resolveClosedCommissionSnapshot,
  DEFAULT_PROJECTION_METHOD,
  type ProjectionMethod,
} from "@/lib/leads/commissionEstimate"
import { DEFAULT_AVG_COMMISSION_PER_LEASE } from "@/lib/demo/demoWorkspace"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatActionDate(iso: string | null | undefined): string {
  if (!iso) return "N/A"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "N/A"
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Builds the styled CRM status block that appears at the top of the notes.
 * Kept separate from buildContactNotes so the format can differ from the
 * plain-text version used during contact creation.
 */
function buildCrmBlock(lead: any): string {
  return [
    "🔥 CRM STATUS",
    "",
    `Stage: ${lead.crm_status || "N/A"}`,
    `Next Action: ${formatActionDate(lead.next_action_date)}`,
    `Follow Ups: ${lead.follow_up_count ?? 0}`,
    "",
    "────────────────",
  ].join("\n")
}

/**
 * Assembles the full biography string: CRM block on top,
 * full lead info section below (via buildContactNotes, no CRM fields passed).
 */
function buildFullNotes(lead: any): string {
  const crmBlock = buildCrmBlock(lead)

  const leadInfo = buildContactNotes({
    source:             lead.source,
    moveDate:           lead.move_date,
    desiredRent:        lead.desired_rent,
    neighborhoods:      lead.neighborhoods,
    submarkets:         lead.submarkets,
    propertyType:       lead.property_type,
    beds:               lead.beds,
    baths:              lead.baths,
    creditScore:        lead.credit_score,
    creditHistory:      lead.credit_history,
    brokenLeaseAge:     lead.broken_lease_age,
    brokenLeaseAmount:  lead.broken_lease_amount,
    evictionAge:        lead.eviction_age,
    evictionBalance:    lead.eviction_balance,
    evictionCourt:      lead.eviction_court,
    criminalBackground: lead.criminal_background,
    criminalCharge:     lead.criminal_charge,
    notes:              lead.notes,
  })

  return `${crmBlock}\n\n${leadInfo}`
}

/**
 * Searches Google Contacts by phone number and returns the resourceName
 * of the first matching contact, or null if none found.
 */
async function findContactByPhone(formattedPhone: string): Promise<string | null> {
  const oauth2Client = getOAuthClient()

  const people = google.people({ version: "v1", auth: oauth2Client })

  // Warmup request required by Google People API before searching
  try {
    await people.people.searchContacts({ query: "", readMask: "names", pageSize: 1 })
  } catch {
    // Non-fatal — continue to real search
  }

  const searchRes = await people.people.searchContacts({
    query: formattedPhone,
    readMask: "names,phoneNumbers,metadata",
    pageSize: 5,
  })

  const resourceName = searchRes.data.results?.[0]?.person?.resourceName
  return resourceName ?? null
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // Auth (401) + active workspace membership (403). workspaceId comes from the
    // session, never the request body.
    const guard = await requireWorkspaceMember()
    if (!guard.ok) return guard.response
    const { userId, workspaceId, supabase } = guard

    // Authoritative locator timezone (profiles → workspaces → America/Chicago) so
    // the workflow successor's 9:00 AM deadline is computed in the locator's saved
    // zone, not the production server zone. Reuses the resolve_timezone DB fn.
    const timeZone = await resolveUserTimeZone(supabase, userId, workspaceId)

    // Locator Working Hours (Profile setting) — clamps the scheduled action's due
    // time to the locator's window; NULL/unconfigured → the 9–21 default. Resolved
    // from the caller's own profile and threaded alongside timeZone into the engine.
    const { data: whProfile } = await supabase
      .from("profiles")
      .select("work_hours_start, work_hours_end")
      .eq("id", userId)
      .maybeSingle()
    const workHours = resolveWorkHoursFromProfile(whProfile)

    const body = await request.json()

    const { leadId, crm_status, next_action_date, follow_up_count, skipWorkflowAction } = body

    if (!leadId || !crm_status) {
      return NextResponse.json(
        { error: "Missing leadId or crm_status" },
        { status: 400 }
      )
    }

    // =====================================================
    // OWNERSHIP + OLD STAGE — RLS-scoped read verifies the lead belongs to the
    // caller's workspace. A lead in another workspace (or a bad id) returns
    // null → safe 404 (never reveals whether it exists elsewhere). The
    // service-role side-effects below only run after this check passes.
    // =====================================================

    const { data: leadBefore } = await supabase
      .from("leads")
      .select("crm_status, owner_user_id, desired_rent, closed_at")
      .eq("id", leadId)
      .maybeSingle()

    if (!leadBefore) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }

    const oldStage = leadBefore.crm_status ?? null

    // =====================================================
    // SUPABASE STAGE UPDATE
    // =====================================================

    const stageUpdate: Record<string, any> = {
      crm_status,
      next_action_date,
      follow_up_count,
    }

    // Set once per transition into "closed" — the historical closed date
    // that Closed-based reporting relies on (see closed_at migration),
    // independent of whether the lead later gets archived by the monthly
    // Closed cleanup — PLUS the frozen estimated-commission snapshot. The
    // snapshot uses the ONE canonical estimator the dashboards use, with the
    // lead OWNER's Sales Goals AT THIS MOMENT, so a later Sales Goals change
    // never rewrites this closed lead's historical Sales/Meta reporting. It is
    // recomputed on every fresh close, so a reopen → reclose freezes against
    // whatever settings are in force at the new close.
    if (oldStage !== "closed" && crm_status === "closed") {
      stageUpdate.closed_at = new Date().toISOString()

      const ownerId = leadBefore.owner_user_id ?? userId
      const { data: goals } = await supabaseAdmin
        .from("profiles")
        .select("avg_commission_per_lease, projection_method")
        .eq("id", ownerId)
        .maybeSingle()
      const method = (goals?.projection_method as ProjectionMethod) ?? DEFAULT_PROJECTION_METHOD
      const avgCommission = Number(goals?.avg_commission_per_lease) || DEFAULT_AVG_COMMISSION_PER_LEASE
      const snapshot = resolveClosedCommissionSnapshot(leadBefore, method, avgCommission)
      stageUpdate.closed_estimated_commission = snapshot.closed_estimated_commission
      stageUpdate.closed_estimation_method = snapshot.closed_estimation_method
    }

    // ↩️ REOPEN — a lead moved OUT of "closed" into an active (non-archived)
    // stage is no longer a historical close: clear the close date + frozen
    // snapshot so it stops counting in closed/revenue reporting. A later
    // reclose stamps a fresh snapshot (above). NOTE: closed → archived is NOT a
    // reopen — an archived close is still a close, so its snapshot is preserved.
    if (oldStage === "closed" && crm_status !== "closed" && crm_status !== "archived") {
      stageUpdate.closed_at = null
      stageUpdate.closed_estimated_commission = null
      stageUpdate.closed_estimation_method = null
    }

    // ↩️ RESTORE — moving a lead OUT of "archived" into any active stage is a
    // canonical restore. Server-authoritatively clear the archive-only metadata
    // (the same fields the Lead-Panel Restore clears) and reset the now-historical
    // terminal follow_up_count to 0, so the workflow-engine side-effect below
    // derives the destination stage's canonical action without a stale count
    // suppressing it (e.g. Contacted's Build List). Completed lead_next_actions
    // rows and Last Action history are never touched here.
    if (oldStage === "archived" && crm_status !== "archived") {
      stageUpdate.archive_reason = null
      stageUpdate.deleted_at = null
      stageUpdate.deleted_by = null
      stageUpdate.pre_delete_status = null
      stageUpdate.follow_up_count = 0
    }

    const { error } = await supabaseAdmin
      .from("leads")
      .update(stageUpdate)
      .eq("id", leadId)
      .eq("workspace_id", workspaceId)

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    // =====================================================
    // FETCH FRESH LEAD DATA (shared by both side-effects below)
    // =====================================================

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("workspace_id", workspaceId)
      .single()

    if (!lead) {
      console.warn(`⚠️  [stage-sync] Lead ${leadId} not found after update — skipping side-effects`)
      return NextResponse.json({ success: true })
    }

    // =====================================================
    // SIDE-EFFECT 0 — WORKFLOW ENGINE (blocking)
    // Only on a real transition (oldStage !== crm_status), never on a
    // same-stage save. Awaited (unlike the two side-effects below) so the
    // created action — if any — can be returned to the client, which is
    // what drives the "✓ Next Action Created" toast.
    // =====================================================

    let workflowAction = null as Awaited<ReturnType<typeof createWorkflowActionIfNeeded>>

    // `skipWorkflowAction` suppresses the successor for this transition — used by
    // the Build List START move (Contacted → Searching) so build_list stays the
    // open action and Send List is created only on explicit "Mark List Built".
    if (oldStage !== crm_status && !skipWorkflowAction) {
      const spec = getStageWorkflowAction(crm_status, lead, timeZone, workHours)
      if (spec) {
        workflowAction = await createWorkflowActionIfNeeded(supabaseAdmin, leadId, spec)
      }
    }

    // =====================================================
    // SIDE-EFFECT 0b — RETIRE THE PRE-LIST CONTACT CHASE (blocking)
    //
    // Once a lead reaches Searching it is no longer being chased for a first
    // reply, so the pre-list chase (Contact Lead → 2nd/3rd/Final Contact Attempt)
    // is finished. Its rows were previously left OPEN forever: ranking demoted
    // them to background so they rarely surfaced as Primary, but they stayed open,
    // kept appearing in other-action lists, and could resurface as Primary in any
    // state with no foreground map. Four production leads had accumulated them,
    // including two CLOSED ones still carrying an open "Contact Lead".
    //
    // This mirrors what contactWorkflow.ts already does when a lead is REACHED
    // mid-chase — same 'canceled' status, which rankLeadActions already treats as
    // a closed state. Nothing is deleted, so a genuine workflow regression can
    // still make an earlier action relevant again.
    //
    // DELIBERATELY NARROW — an explicit list of four keys, NOT "everything outside
    // the new stage's foreground set". A foreground sweep would break the Build
    // List START move, which is exactly `contacted → searching` with
    // skipWorkflowAction and relies on build_list staying OPEN in Searching. It
    // would also hit per-property email_guest_card rows and the applied→denied
    // regression, where foreground membership is not a safe proxy for "stale".
    //
    // Runs regardless of skipWorkflowAction: that flag suppresses the SUCCESSOR
    // action for this transition, not the retirement of a finished sequence.
    // The ids are returned so the client can retire the same rows in its local
    // state immediately. Without that the panel keeps them as OPEN until the next
    // refetch and can still list a retired "2nd Contact Attempt" beside Send List.
    let canceledActionIds: Array<number | string> = []
    if (oldStage !== crm_status && STAGES_PAST_CONTACT_CHASE.has(crm_status)) {
      const { data: canceled, error: chaseErr } = await supabaseAdmin
        .from("lead_next_actions")
        .update({ status: "canceled" })
        .eq("lead_id", leadId)
        .eq("status", "open")
        .in("action_key", CONTACT_CHASE_ACTION_KEYS)
        .select("id")
      // Non-fatal: a stale open chase row is a display nuisance, never a reason to
      // fail the stage change the locator just made.
      if (chaseErr) console.error("[stage-sync] contact-chase cleanup failed:", chaseErr)
      else canceledActionIds = (canceled ?? []).map((r: { id: number | string }) => r.id)
    }

    // LIST SENT LADDER — the same stand-down, one stage later.
    //
    // Moving to Ready to Tour (or beyond) used to ADD `setup_tour` and retire
    // nothing, so the open ladder survived: Ka'Leah Davis sat in Ready to Tour
    // with send_list, follow_up_1 AND follow_up_2 all still open, and 6 of 17 live
    // leads carried contradictory open actions this way. A lead being toured is
    // not still waiting on "did you see the list?" nudges.
    //
    // Same explicit-key list, same 'canceled' status, same non-fatal handling as
    // the chase above — nothing is deleted, so a genuine regression can make an
    // earlier action relevant again. Runs regardless of skipWorkflowAction, which
    // suppresses the SUCCESSOR for this transition, not the retirement of a
    // finished sequence.
    if (oldStage !== crm_status && STAGES_PAST_LIST_LADDER.has(crm_status)) {
      const { data: retired, error: ladderErr } = await supabaseAdmin
        .from("lead_next_actions")
        .update({ status: "canceled" })
        .eq("lead_id", leadId)
        .eq("completed", false)
        .eq("status", "open")
        .in("action_key", LIST_LADDER_ACTION_KEYS as unknown as string[])
        .select("id")
      if (ladderErr) console.error("[stage-sync] list-ladder cleanup failed:", ladderErr)
      else canceledActionIds = [...canceledActionIds, ...(retired ?? []).map((r: { id: number | string }) => r.id)]
    }

    // =====================================================
    // SIDE-EFFECT 1 — GOOGLE CONTACT SYNC (non-blocking)
    // Failure here must NEVER prevent the calendar event.
    // =====================================================

    try {
      console.log(`🔍 [stage-sync] lead ${leadId} — google_contact_id: ${lead.google_contact_id ?? "null"}`)

      const notes = buildFullNotes(lead)

      if (lead.google_contact_id) {
        // ── Path A: stored resourceName ──────────────────
        console.log(`🔍 [stage-sync] Path A — updating via stored ID: ${lead.google_contact_id}`)
        await updateGoogleContactNotes(lead.google_contact_id, notes)
        console.log(`✅ [stage-sync] Path A — Google Contact notes updated`)
      } else if (lead.phone) {
        // ── Path B: no stored ID — search by phone ───────
        console.log(`🔍 [stage-sync] Path B — no google_contact_id, searching by phone`)
        console.log(`🔍 [stage-sync] lead.phone (raw):  ${lead.phone}`)

        const cleanedPhone = String(lead.phone)
          .replace(/\D/g, "")
          .replace(/^1/, "")

        if (cleanedPhone) {
          const formattedPhone = `+1${cleanedPhone}`
          console.log(`🔍 [stage-sync] phone (formatted): ${formattedPhone}`)

          const resourceName = await findContactByPhone(formattedPhone)

          if (resourceName) {
            console.log(`✅ [stage-sync] Google contact found: ${resourceName}`)
            console.log(`🔍 [stage-sync] calling updateGoogleContactNotes...`)
            await updateGoogleContactNotes(resourceName, notes)
            console.log(`✅ [stage-sync] Google Contact notes updated via phone search`)
          } else {
            console.warn(`⚠️  [stage-sync] No Google contact found for phone ${formattedPhone} (lead ${leadId})`)
          }
        } else {
          console.warn(`⚠️  [stage-sync] Phone cleaned to empty string — skipping search (raw: ${lead.phone})`)
        }
      } else {
        console.warn(`⚠️  [stage-sync] lead ${leadId} has no google_contact_id and no phone — skipping Google sync`)
      }
    } catch (googleContactError) {
      // Log and continue — a Contact sync failure must never block the calendar event
      console.error(`❌ [stage-sync] Google Contact sync failed for lead ${leadId}:`, googleContactError)
    }

    // =====================================================
    // SIDE-EFFECT 2 — LIST SENT CALENDAR EVENT (non-blocking)
    // Runs independently of the Contact sync above.
    // Only fires on the FIRST transition into list_sent.
    // =====================================================

    if (oldStage !== "list_sent" && crm_status === "list_sent") {
      console.log(`📋 [stage-sync] List Sent calendar trigger starting — lead ${leadId}`)
      createListSentCalendarEvent({
        first_name:   lead.first_name,
        last_name:    lead.last_name,
        phone:        lead.phone,
        city:         lead.city,
        source:       lead.source,
        desired_rent: lead.desired_rent,
        beds:         lead.beds,
        move_date:    lead.move_date,
      })
        .then(() => {
          console.log(`✅ [stage-sync] List Sent calendar created — lead ${leadId}`)
        })
        .catch((err) => {
          console.error(`❌ [stage-sync] List Sent calendar failed — lead ${leadId}:`, err)
        })
    } else {
      console.log(`📋 [stage-sync] List Sent calendar skipped — oldStage: ${oldStage}, newStage: ${crm_status}`)
    }

    return NextResponse.json({ success: true, workflowAction, canceledActionIds })
  } catch (error) {
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    )
  }
}
