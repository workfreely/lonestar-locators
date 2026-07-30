export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { generateDeviceToken } from "@/lib/companion/auth"
import { getFeatureEntitlement } from "@/lib/companion/entitlement"
import { supabaseAdmin } from "@/lib/supabase/admin"

// Issue a device token for a Mac Companion. Called from the authenticated
// pairing page (session-based), NOT by the companion itself. Returns the raw
// token exactly once — the companion stores it in the Keychain.
export async function POST(req: Request) {
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response
  const { userId, workspaceId } = guard

  // Entitlement is checked at pairing time too — a non-entitled workspace
  // cannot pair a new device. (Existing tokens stay paired but unusable when
  // entitlement later lapses; the ingest/status gates handle that.)
  const entitlement = await getFeatureEntitlement(userId, workspaceId, "messages_sync")
  if (!entitlement.entitled) {
    return NextResponse.json(
      { error: "Messages Sync is not active for this workspace", entitled: false, reason: entitlement.reason },
      { status: 403 }
    )
  }

  let deviceName = "Mac Companion"
  try {
    const body = await req.json()
    if (typeof body?.deviceName === "string" && body.deviceName.trim()) {
      deviceName = body.deviceName.trim().slice(0, 120)
    }
  } catch {
    /* empty body is fine */
  }

  const { raw, hash, prefix } = generateDeviceToken()

  // If a device is awaiting re-pair after a Reset (pairing_reset_at set, not
  // revoked), REUSE that row so its history (name, created_at, last_synced_at)
  // is preserved and credentials simply rotate. Otherwise create a new device.
  const { data: resetRow } = await supabaseAdmin
    .from("device_tokens")
    .select("id")
    .eq("workspace_id", workspaceId)
    .not("pairing_reset_at", "is", null)
    .is("revoked_at", null)
    .order("pairing_reset_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (resetRow) {
    const { error } = await supabaseAdmin
      .from("device_tokens")
      .update({ token_hash: hash, token_prefix: prefix, pairing_reset_at: null })
      .eq("id", resetRow.id)
    if (error) {
      console.error("[companion/pair] reset re-pair failed:", error.message)
      return NextResponse.json({ error: "Failed to pair device" }, { status: 500 })
    }
    return NextResponse.json({ token: raw, deviceName })
  }

  const { error } = await supabaseAdmin.from("device_tokens").insert({
    user_id: userId,
    workspace_id: workspaceId,
    device_name: deviceName,
    token_hash: hash,
    token_prefix: prefix,
  })

  if (error) {
    console.error("[companion/pair] insert failed:", error.message)
    return NextResponse.json({ error: "Failed to pair device" }, { status: 500 })
  }

  // Raw token returned ONCE. Never retrievable again.
  return NextResponse.json({ token: raw, deviceName })
}
