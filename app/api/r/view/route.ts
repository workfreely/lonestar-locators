import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { hashShareToken, looksLikeShareToken } from "@/lib/clientShare/token"

// Public, token-scoped VIEW BEACON for a Client Recommendation list.
//
// WHY THIS EXISTS. The page used to record the view itself with a fire-and-forget
// `void supabase.rpc(...)` during server render. Un-awaited work is routinely dropped when the
// serverless function is frozen once the response is sent, and production proved it: 18 shares,
// 4 of them with favorites a client could only have set by opening the page, and ZERO recorded
// views. Awaiting the RPC here is the whole fix.
//
// Doing it from the BROWSER rather than the render also solves the crawler problem for free. The
// /r page is force-dynamic, so every link-preview fetch (iMessage, Facebook, Slack) re-ran the
// render and would have counted as a view; preview bots do not execute JavaScript, so they never
// reach this endpoint.
//
// NOT A SECOND TRACKING SYSTEM: this calls the SAME lb_record_client_share_view RPC as before, so
// the 30-minute sessionization, first/last-viewed stamps, hit_count and the
// disabled/revoked no-op all keep their existing semantics untouched. This route only changes WHO
// calls it and WHEN.
//
// Auth matches the favorite route exactly: the renter has no account, the share token IS the
// credential, and every access decision lives inside the SECURITY DEFINER function — an unknown,
// revoked or disabled share is a silent no-op there. A caller holding the token can already read
// the list, so recording that it was viewed grants no new access.
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
  // AWAITED — the entire point of this route.
  const { error } = await supabase.rpc("lb_record_client_share_view", {
    p_token_hash: hashShareToken(token),
  })
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 })

  // The RPC returns void and is a deliberate no-op for an unknown/revoked/disabled share, so a
  // clean 200 here means "recorded if recordable" — never an assertion that a view was counted.
  return NextResponse.json({ ok: true })
}
