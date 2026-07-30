import { NextResponse } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"

export async function POST(req: Request) {
  try {
    // Auth (401) + active workspace membership (403). Uses the RLS-enforced
    // client, so the update below is scoped to the caller's workspace.
    const guard = await requireWorkspaceMember()
    if (!guard.ok) return guard.response
    const { supabase } = guard

    const body = await req.json()
    const { leadId, instagram, tiktok, facebook } = body

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 })
    }

    // Only update fields that were passed in.
    const updateData: Record<string, unknown> = {}
    if (instagram !== undefined) updateData.instagram = instagram
    if (tiktok !== undefined) updateData.tiktok = tiktok
    if (facebook !== undefined) updateData.facebook = facebook

    // RLS scopes the update to the caller's workspace. A lead in another
    // workspace (or a non-existent id) matches 0 rows → safe 404 that does not
    // reveal whether the record exists in some other workspace.
    const { data, error } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", leadId)
      .select("id")

    if (error) {
      console.error("[update-socials] update failed:", error.message)
      return NextResponse.json({ error: "Update failed" }, { status: 500 })
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("API error:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
