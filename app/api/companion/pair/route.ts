export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { generateDeviceToken } from "@/lib/companion/auth"
import { supabaseAdmin } from "@/lib/supabase/admin"

// Issue a device token for a Mac Companion. Called from the authenticated
// pairing page (session-based), NOT by the companion itself. Returns the raw
// token exactly once — the companion stores it in the Keychain.
export async function POST(req: Request) {
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response
  const { userId, workspaceId } = guard

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
