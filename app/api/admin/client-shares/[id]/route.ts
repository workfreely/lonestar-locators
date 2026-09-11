import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

// PATCH /api/admin/client-shares/:id  { disabled: boolean }
//
// Toggle a single share between Active and Disabled (agent-facing terms). This is
// the reversible control: disabled_at = now() disables, null re-activates the SAME
// url. It never touches revoked_at (internal-only hard kill) and never mints.
//
// AUTH: the caller's own session; the table's RLS UPDATE policy restricts the row
// to a workspace the caller is an active member of — a share in another workspace
// simply matches no row (→ 404), so cross-workspace toggling is impossible.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "share id required" }, { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const disabled = (body as { disabled?: unknown } | null)?.disabled
  if (typeof disabled !== "boolean") {
    return NextResponse.json({ error: "disabled (boolean) required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("client_recommendation_shares")
    .update({ disabled_at: disabled ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id, disabled_at")
    .maybeSingle()
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 })
  // No row updated → the id doesn't exist OR isn't in the caller's workspace.
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 })

  return NextResponse.json({
    id: (data as { id: string }).id,
    status: (data as { disabled_at: string | null }).disabled_at ? "disabled" : "active",
  })
}
