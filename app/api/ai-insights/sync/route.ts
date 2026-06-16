import { NextRequest, NextResponse } from "next/server"
import { syncAiInsights } from "@/lib/ai/syncAiInsights"

export async function POST(req: NextRequest) {
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
