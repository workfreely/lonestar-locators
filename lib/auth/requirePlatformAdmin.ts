import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Shared server-side guard for PLATFORM-ADMIN-ONLY routes (Social Autopilot beta).
//
//   const guard = await requirePlatformAdmin()
//   if (!guard.ok) return guard.response      // 401 (no session) or 403 (not admin)
//   const { userId, supabase } = guard
//
// - Verifies the caller with auth.getUser() (session cookie) → 401 when unauthenticated.
// - Confirms platform-admin via the existing is_platform_admin() RPC (backed by the
//   platform_admins table; SECURITY DEFINER; self-elevation-proof) → 403 otherwise.
// - Returns userId derived ENTIRELY from the session (never the request body) plus the
//   RLS-enforced client. Identity lives in the platform_admins table — NEVER a hard-
//   coded email or user id in code. This is the ONE authorization boundary for every
//   Social Autopilot server/API surface; client-side menu gating is UX only.
export type PlatformAdminGuardOk = {
  ok: true
  userId: string
  supabase: Awaited<ReturnType<typeof createClient>>
}
export type PlatformAdminGuardFail = { ok: false; response: NextResponse }

export async function requirePlatformAdmin(): Promise<PlatformAdminGuardOk | PlatformAdminGuardFail> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) }
  }

  const { data: isAdmin, error } = await supabase.rpc("is_platform_admin")
  if (error || isAdmin !== true) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }

  return { ok: true, userId: user.id, supabase }
}
