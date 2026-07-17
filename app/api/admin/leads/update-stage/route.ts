import { NextResponse } from "next/server"
import { google } from "googleapis"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { buildContactNotes } from "@/lib/google/buildContactNotes"
import { updateGoogleContactNotes } from "@/lib/google/updateContactNotes"
import { getOAuthClient } from "@/lib/google/getOAuthClient"
import { createListSentCalendarEvent } from "@/lib/google/createCalendarEvent"

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
    const body = await request.json()

    const { leadId, crm_status, next_action_date, follow_up_count } = body

    if (!leadId || !crm_status) {
      return NextResponse.json(
        { error: "Missing leadId or crm_status" },
        { status: 400 }
      )
    }

    // =====================================================
    // READ OLD STAGE (needed for Calendar automation guards)
    // =====================================================

    const { data: leadBefore } = await supabaseAdmin
      .from("leads")
      .select("crm_status")
      .eq("id", leadId)
      .single()

    const oldStage = leadBefore?.crm_status ?? null

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
    // Closed cleanup.
    if (oldStage !== "closed" && crm_status === "closed") {
      stageUpdate.closed_at = new Date().toISOString()
    }

    const { error } = await supabaseAdmin
      .from("leads")
      .update(stageUpdate)
      .eq("id", leadId)

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
      .single()

    if (!lead) {
      console.warn(`⚠️  [stage-sync] Lead ${leadId} not found after update — skipping side-effects`)
      return NextResponse.json({ success: true })
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

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    )
  }
}
