import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const { leadId, instagram, tiktok, facebook } = body

    if (!leadId) {
      return NextResponse.json(
        { error: "Missing leadId" },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Only update fields that were passed in
    const updateData: any = {}

    if (instagram !== undefined) updateData.instagram = instagram
    if (tiktok !== undefined) updateData.tiktok = tiktok
    if (facebook !== undefined) updateData.facebook = facebook

    const { error } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", leadId)

    if (error) {
      console.error("Supabase error:", error)
      return NextResponse.json({ error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("API error:", err)
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    )
  }
}