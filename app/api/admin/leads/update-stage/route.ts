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

    const { error } = await supabaseAdmin
      .from("leads")
      .update({
        crm_status,
        next_action_date,
        follow_up_count,
      })
      .eq("id", leadId)

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    // =====================================================
    // GOOGLE CONTACT SYNC (non-blocking)
    // =====================================================

    try {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single()

      if (!lead) throw new Error("Lead not found after update")

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
      // =====================================================
      // GOOGLE CALENDAR — List Sent FU1 reminder (non-blocking)
      // Only fires on the first transition into list_sent.
      // =====================================================

      if (oldStage !== "list_sent" && crm_status === "list_sent") {
        console.log(`📋 [stage-sync] list_sent transition detected for lead ${leadId} — creating FU1 Calendar event`)
        createListSentCalendarEvent({
          first_name:   lead.first_name,
          last_name:    lead.last_name,
          phone:        lead.phone,
          city:         lead.city,
          source:       lead.source,
          desired_rent: lead.desired_rent,
          beds:         lead.beds,
          move_date:    lead.move_date,
        }).catch((err) => {
          console.error("📋 [stage-sync] List Sent FU1 Calendar event failed:", err)
        })
      }

    } catch (googleError) {
      console.warn("Google Contact stage sync failed:", googleError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    )
  }
}
