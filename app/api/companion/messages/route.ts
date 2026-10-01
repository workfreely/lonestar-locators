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
import { toE164 } from "@/lib/phone/identity"
import { attributeUnattributedMessages } from "@/lib/companion/attribution"

const MAX_BATCH = 500
const MAX_BODY_LEN = 20_000

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

  // STORE, then ATTRIBUTE — deliberately two steps.
  //
  // `lead_id` is absent from these rows, which is the whole point. PostgREST builds
  // its ON CONFLICT DO UPDATE from the keys present in the payload, so omitting
  // lead_id means a NEW row lands unattributed and an EXISTING row keeps whatever
  // attribution it already has while its content is refreshed.
  //
  // That is what makes a re-sync safe. The previous version recomputed lead_id on
  // every upsert, so re-uploading the same message after a lead's phone number
  // changed would silently relocate that conversation to a different lead. Now
  // attribution only ever fills blanks.
  const rows = clean.map((m) => ({
    workspace_id: workspaceId,
    owner_user_id: userId,
    guid: m.guid,
    phone: m.phone,
    // Canonical identity derived once, here, from the raw Apple handle — the
    // handle itself is kept in `phone` untouched for display and debugging.
    phone_e164: toE164(m.phone),
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

  // Attribution, narrowed to the identities in THIS batch so a large unattributed
  // backlog is not rescanned on every sync. Failure is non-fatal: the messages are
  // already stored, and the same call from a later batch — or from saving a phone
  // number — will attribute them. Losing the batch over an attribution hiccup
  // would be a far worse outcome than a brief delay in attribution.
  let attribution: Awaited<ReturnType<typeof attributeUnattributedMessages>> | null = null
  try {
    attribution = await attributeUnattributedMessages(supabaseAdmin, workspaceId, {
      identities: Array.from(new Set(rows.map((r) => r.phone_e164).filter((p): p is string => !!p))),
    })
    if (attribution.conflicts.length > 0) {
      // Surfaced rather than guessed: two live leads share one number, so these
      // messages stay unattributed until a human resolves which lead is right.
      console.warn(
        "[companion/messages] ambiguous phone identity, left unattributed:",
        JSON.stringify(attribution.conflicts),
      )
    }
  } catch (e) {
    console.error("[companion/messages] attribution failed (messages stored):", (e as Error).message)
  }

  // Stamp last successful sync for the Connected Devices "Last Sync" display.
  await supabaseAdmin
    .from("device_tokens")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", deviceId)

  return NextResponse.json({
    accepted: rows.length,
    entitled: true,
    syncEnabled: true,
    // Echoed so the Mac's log shows whether a sync actually connected anything,
    // rather than only that it uploaded. Omitted entirely if attribution threw.
    ...(attribution ? { attributed: attribution.attributed, unmatched: attribution.no_match } : {}),
  })
}
