import { NextRequest, NextResponse } from "next/server"
import { syncAiInsights } from "@/lib/ai/syncAiInsights"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"

export async function POST(req: NextRequest) {
  // Auth (401) + active workspace membership (403). Called only from the
  // authenticated CRM (LeadInsights), but the endpoint itself must not be an
  // open, unauthenticated trigger that reads/writes any lead's AI brief.
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  let leadId: string | number | undefined

  try {
    const body = await req.json()
    leadId = body?.leadId
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (leadId === undefined || leadId === null || leadId === "") {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 })
  }

  // Ownership — the RLS-scoped read only returns the lead if it belongs to the
  // caller's workspace. A lead in another workspace (or a bad id) → null → safe
  // 404, gating the service-role read/upsert that syncAiInsights performs.
  const { data: ownedLead } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .maybeSingle()

  if (!ownedLead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  try {
    await syncAiInsights(leadId)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    const status =
      message.startsWith("Lead not found") ||
      message.startsWith("Lead ") ||
      message.includes("no phone")
        ? 400
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}
