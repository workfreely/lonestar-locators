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

  let body: { intentId?: unknown; status?: unknown; localSentAt?: unknown; error?: unknown; messageGuid?: unknown }
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
  // chat.db guid of the message this send produced, when the Mac could capture it.
  // Optional: an older build omits it and provenance falls back to exact-body
  // correlation. Accepting it here means the Mac side can start reporting it
  // without a second server change. See lib/companion/provenance.ts.
  const messageGuid =
    typeof body.messageGuid === "string" && body.messageGuid.trim() ? body.messageGuid.trim().slice(0, 255) : null

  const result = await runAck(store, { intentId, workspaceId, deviceId, status, localSentAt, error: errText, messageGuid })
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "ack_failed" }, { status: result.code ?? 400 })
  }
  return NextResponse.json({ ok: true, ...(result.already ? { already: true } : {}), ...(result.status ? { status: result.status } : {}) })
}
