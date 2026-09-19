export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"

// POST → disconnect the admin's TikTok connection. Platform-admin ONLY. Deletes the Vault
// secret (revoking our stored token bundle) and removes the connection row, so no usable
// token is left orphaned. Does NOT touch any Library/post content or Instagram.
export async function POST() {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { error } = await supabase.rpc("sa_disconnect_tiktok")
  if (error) return NextResponse.json({ error: "disconnect_failed" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
