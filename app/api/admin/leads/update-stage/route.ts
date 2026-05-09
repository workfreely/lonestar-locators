import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const { leadId, crm_status, next_follow_up } = body

    if (!leadId || !crm_status) {
      return NextResponse.json(
        { error: "Missing leadId or crm_status" },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from("leads")
      .update({
        crm_status,
        next_follow_up,
      })
      .eq("id", leadId)

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    )
  }
}