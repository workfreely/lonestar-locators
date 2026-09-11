export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"

// POST → disconnect the admin's Instagram connection. Platform-admin ONLY. Deletes the
// Vault secret (revoking our stored credential) and removes the connection row, so no
// usable token is left orphaned. Does NOT touch any Library/post content.
export async function POST() {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { error } = await supabase.rpc("sa_disconnect_instagram")
  if (error) return NextResponse.json({ error: "disconnect_failed" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
