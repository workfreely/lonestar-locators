import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { hashShareToken, looksLikeShareToken } from "@/lib/clientShare/token"

// Public, token-scoped "Done Selecting Favorites" for a Client Recommendation list.
//
// One atomic workflow event (see lb_mark_client_done_selecting): reconcile the
// client's currently-hearted properties into canonical lead_favorites, forward-only
// advance the eligible lead to Ready to Tour, create the canonical Ready-to-Tour
// action, and stamp done_selecting_at. The share token IS the credential (hashed in
// Node before the DB); no lead/property db id is accepted or returned. Unknown/
// revoked/disabled shares are silent no-ops in the RPC and reported here as a failure
// so the client page does NOT present Done as complete for a dead share.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }

  const token = (body as { token?: unknown } | null)?.token
  if (typeof token !== "string" || !looksLikeShareToken(token)) {
    return NextResponse.json({ error: "bad_token" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("lb_mark_client_done_selecting", {
    p_token_hash: hashShareToken(token),
  })
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 })

  // The RPC returns null for an unknown/revoked/disabled share. Treat that as a
  // non-success so the page keeps the client in the selecting state (no false Done).
  const row = (Array.isArray(data) ? data[0] : data) as { ok?: boolean } | null
  if (!row?.ok) return NextResponse.json({ error: "unavailable" }, { status: 409 })
  return NextResponse.json({ ok: true })
}
