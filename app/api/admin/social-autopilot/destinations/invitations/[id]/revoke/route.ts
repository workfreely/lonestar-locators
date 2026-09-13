export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"

// POST → revoke an unused invitation before it is authorized. Platform-admin ONLY; ownership +
// unused/unrevoked enforced inside sa_revoke_destination_invitation. Returns { revoked: boolean }
// — false when the invite doesn't exist, isn't the caller's, or was already used/revoked.
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { id } = await ctx.params
  const { data, error } = await supabase.rpc("sa_revoke_destination_invitation", { p_id: id })
  if (error) return NextResponse.json({ error: "revoke_failed" }, { status: 500 })
  return NextResponse.json({ ok: true, revoked: data === true })
}
