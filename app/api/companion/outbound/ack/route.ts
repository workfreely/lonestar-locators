export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireDeviceToken } from "@/lib/companion/auth"
import { runAck } from "@/lib/followup/engine"
import { SupabaseFollowupStore } from "@/lib/followup/stores/supabaseStore"

// Beast Sync ACK. Auth + payload validation here; the shared engine core (runAck)
// records the result, enforces idempotency, and advances the run only on a
// confirmed send — the same logic production has always used. "sent" = submitted
// through Apple Messages (NOT a delivery receipt).
const store = new SupabaseFollowupStore()

export async function POST(req: Request) {
  const auth = await requireDeviceToken(req)
  if (!auth.ok) return auth.response
  const { workspaceId, deviceId } = auth

  let body: { intentId?: unknown; status?: unknown; localSentAt?: unknown; error?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const intentId = typeof body.intentId === "string" ? body.intentId : ""
  const status = body.status === "sent" || body.status === "failed" ? body.status : null
  if (!intentId || !status) {
    return NextResponse.json({ error: "intentId and status ('sent'|'failed') required" }, { status: 400 })
  }
  const localSentAt =
    typeof body.localSentAt === "string" && !isNaN(new Date(body.localSentAt).getTime())
      ? new Date(body.localSentAt).toISOString()
      : new Date().toISOString()
  const errText = typeof body.error === "string" ? body.error.slice(0, 500) : null

  const result = await runAck(store, { intentId, workspaceId, deviceId, status, localSentAt, error: errText })
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "ack_failed" }, { status: result.code ?? 400 })
  }
  return NextResponse.json({ ok: true, ...(result.already ? { already: true } : {}), ...(result.status ? { status: result.status } : {}) })
}
