import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { hashShareToken, looksLikeShareToken } from "@/lib/clientShare/token"

// Public, token-scoped favorite toggle for a Client Recommendation list.
//
// The renter has no account — the share token IS the credential, exactly as on
// the page it comes from. The token never leaves the request body, the item is
// referenced by its public sort_order (never a database id), and every access
// decision lives inside lb_set_client_favorite (SECURITY DEFINER, pinned
// search_path): unknown/revoked/paused shares are silent no-ops. A caller holding
// the token can already read the list, so toggling its favorites grants no new
// access — there is nothing to amplify here.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }

  const token = (body as { token?: unknown } | null)?.token
  const index = (body as { index?: unknown } | null)?.index
  const favorited = (body as { favorited?: unknown } | null)?.favorited

  if (typeof token !== "string" || !looksLikeShareToken(token)) {
    return NextResponse.json({ error: "bad_token" }, { status: 400 })
  }
  if (!Number.isInteger(index) || (index as number) < 0) {
    return NextResponse.json({ error: "bad_index" }, { status: 400 })
  }
  if (typeof favorited !== "boolean") {
    return NextResponse.json({ error: "bad_favorited" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("lb_set_client_favorite", {
    p_token_hash: hashShareToken(token),
    p_sort_order: index,
    p_favorited: favorited,
  })
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 })

  // The RPC returns no row for an unknown/revoked/paused share — report the
  // requested state back without leaking which of those it was.
  const row = (Array.isArray(data) ? data[0] : data) as { favorited?: boolean } | undefined
  return NextResponse.json({ ok: true, favorited: row?.favorited ?? favorited })
}
