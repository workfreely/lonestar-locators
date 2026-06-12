import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { buildContactNotes } from "@/lib/google/buildContactNotes"
import { updateGoogleContactNotes } from "@/lib/google/updateContactNotes"

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

      if (lead?.google_contact_id) {
        const notes = buildContactNotes({
          crm_status:         lead.crm_status,
          next_follow_up:     lead.next_action_date,
          follow_up_count:    lead.follow_up_count,
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

        await updateGoogleContactNotes(lead.google_contact_id, notes)
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
