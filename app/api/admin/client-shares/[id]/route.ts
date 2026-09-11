import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/admin/client-shares/:id  → Copy Link: the EXACT original share URL.
//
// The raw token is retrieved server-side from Supabase Vault via the SECURITY
// DEFINER lb_get_client_share_url, which verifies the caller is an active member of
// the share's workspace (cross-workspace → 403) and is the ONLY reader of Vault.
// The public /r/<token> resolver is untouched. One sent list = one stable URL.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "share id required" }, { status: 400 })

  const { data, error } = await supabase.rpc("lb_get_client_share_url", { p_share_id: id })
  if (error) {
    const forbidden = /not a member/i.test(error.message)
    return NextResponse.json(
      { error: forbidden ? "forbidden" : "link_failed" },
      { status: forbidden ? 403 : 500 },
    )
  }
  const raw = typeof data === "string" ? data : null
  // Unknown share, wrong workspace (null from the guard's null-return path), or a
  // legacy share with no stored token → nothing to hand back.
  if (!raw) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const url = new URL(`/r/${raw}`, req.nextUrl.origin).toString()
  return NextResponse.json({ url })
}

// PATCH /api/admin/client-shares/:id
//   { disabled: boolean }  → toggle Active/Disabled
//   { sent: true }         → stamp sent_at for this send cycle ("Yes, List Sent")
//
// disabled is the reversible control: disabled_at = now() disables, null re-activates
// the SAME url. It never touches revoked_at (internal-only hard kill) and never mints.
//
// sent stamps sent_at = now() ONCE (idempotent — only while sent_at is null) so a
// snapshot records when its list was actually sent to the client. It is applied only
// on the explicit confirmation, never on preparing or copying the link. A previously
// sent snapshot keeps its original sent_at (never re-stamped, never altered).
//
// AUTH: the caller's own session; the table's RLS UPDATE policy restricts the row
// to a workspace the caller is an active member of — a share in another workspace
// simply matches no row (→ 404), so cross-workspace changes are impossible.
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
  const sent = (body as { sent?: unknown } | null)?.sent

  // Mark sent (idempotent): stamp sent_at only if it is still null so a re-confirm or
  // a repeated click can never overwrite the original send time.
  if (sent === true) {
    const { data, error } = await supabase
      .from("client_recommendation_shares")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", id)
      .is("sent_at", null)
      .select("id, sent_at")
      .maybeSingle()
    if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 })
    if (!data) {
      // Either already sent (fetch its existing stamp) or not the caller's row (404).
      const { data: existing } = await supabase
        .from("client_recommendation_shares")
        .select("id, sent_at")
        .eq("id", id)
        .maybeSingle()
      if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 })
      return NextResponse.json({
        id: (existing as { id: string }).id,
        sentAt: (existing as { sent_at: string | null }).sent_at,
      })
    }
    return NextResponse.json({
      id: (data as { id: string }).id,
      sentAt: (data as { sent_at: string | null }).sent_at,
    })
  }

  if (typeof disabled !== "boolean") {
    return NextResponse.json({ error: "disabled (boolean) or sent (true) required" }, { status: 400 })
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
