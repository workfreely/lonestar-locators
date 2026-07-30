export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requireDeviceToken } from "@/lib/companion/auth"
import {
  getFeatureEntitlement,
  isCompanionMaintenance,
  isVersionSupported,
} from "@/lib/companion/entitlement"
import { rateLimit } from "@/lib/rateLimit"
import { supabaseAdmin } from "@/lib/supabase/admin"

const MAX_BATCH = 500
const MAX_BODY_LEN = 20_000

const last10 = (raw: string | null | undefined) => (raw || "").replace(/\D/g, "").slice(-10)

type IncomingMessage = {
  guid?: unknown
  phone?: unknown
  isFromMe?: unknown
  body?: unknown
  sentAt?: unknown
}

// Companion ingest: a batch of iMessage/SMS rows. Device-token authenticated;
// user + workspace resolved server-side from the token. Idempotent per
// (workspace, guid), so at-least-once delivery / retries are safe.
export async function POST(req: Request) {
  const auth = await requireDeviceToken(req)
  if (!auth.ok) return auth.response
  const { userId, workspaceId, deviceId, syncPaused, appVersion } = auth

  // Global maintenance — reject all uploads, tell the device to pause.
  if (isCompanionMaintenance()) {
    return NextResponse.json(
      { error: "Service temporarily unavailable", entitled: true, syncEnabled: false, maintenance: true },
      { status: 503 }
    )
  }

  // Unsupported version — force an update before accepting data.
  if (!isVersionSupported(appVersion)) {
    return NextResponse.json(
      { error: "Update required", entitled: true, syncEnabled: false, updateRequired: true },
      { status: 426 }
    )
  }

  // Per-device remote pause.
  if (syncPaused) {
    return NextResponse.json(
      { error: "This device is paused", entitled: true, syncEnabled: false, syncPaused: true },
      { status: 403 }
    )
  }

  // 120 batches/min per device — comfortably above steady-state sync.
  const limit = rateLimit(`companion:${deviceId}`, 120, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    )
  }

  // Entitlement gate — if the workspace can't use Messages Sync (expired trial /
  // canceled / past due), reject and tell the Companion to pause. `entitled` is
  // echoed so the client can react without a separate status call.
  const entitlement = await getFeatureEntitlement(userId, workspaceId, "messages_sync")
  if (!entitlement.entitled) {
    return NextResponse.json(
      { error: "Messages Sync is not active for this workspace", entitled: false, reason: entitlement.reason },
      { status: 403 }
    )
  }

  let messages: IncomingMessage[]
  try {
    const body = await req.json()
    messages = body?.messages
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "messages must be an array" }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (messages.length > MAX_BATCH) {
    return NextResponse.json({ error: `Batch too large (max ${MAX_BATCH})` }, { status: 400 })
  }
  if (messages.length === 0) {
    return NextResponse.json({ accepted: 0 })
  }

  // Normalize + validate. A row needs a guid; everything else is best-effort.
  const clean = messages
    .map((m) => {
      const guid = typeof m.guid === "string" ? m.guid.trim() : ""
      if (!guid) return null
      const bodyText = typeof m.body === "string" ? m.body.slice(0, MAX_BODY_LEN) : null
      const phone = typeof m.phone === "string" ? m.phone.trim() : null
      let sentAt: string | null = null
      if (typeof m.sentAt === "string" && m.sentAt) {
        const d = new Date(m.sentAt)
        if (!isNaN(d.getTime())) sentAt = d.toISOString()
      }
      return { guid, phone, is_from_me: m.isFromMe === true, body: bodyText, sentAt }
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)

  if (clean.length === 0) {
    return NextResponse.json({ accepted: 0 })
  }

  // Attribute to leads by last-10-digit phone match within THIS workspace.
  const phoneKeys = Array.from(new Set(clean.map((m) => last10(m.phone)).filter(Boolean)))
  const phoneToLead = new Map<string, number>()
  if (phoneKeys.length > 0) {
    const { data: leadRows } = await supabaseAdmin
      .from("leads")
      .select("id, phone")
      .eq("workspace_id", workspaceId)
    for (const lead of leadRows || []) {
      const key = last10(lead.phone as string)
      if (key && !phoneToLead.has(key)) phoneToLead.set(key, lead.id as number)
    }
  }

  const rows = clean.map((m) => ({
    workspace_id: workspaceId,
    owner_user_id: userId,
    lead_id: phoneToLead.get(last10(m.phone)) ?? null,
    guid: m.guid,
    phone: m.phone,
    is_from_me: m.is_from_me,
    body: m.body,
    sent_at: m.sentAt,
  }))

  const { error } = await supabaseAdmin
    .from("companion_messages")
    .upsert(rows, { onConflict: "workspace_id,guid" })

  if (error) {
    console.error("[companion/messages] upsert failed:", error.message)
    return NextResponse.json({ error: "Failed to store messages" }, { status: 500 })
  }

  // Stamp last successful sync for the Connected Devices "Last Sync" display.
  await supabaseAdmin
    .from("device_tokens")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", deviceId)

  return NextResponse.json({ accepted: rows.length, entitled: true, syncEnabled: true })
}
