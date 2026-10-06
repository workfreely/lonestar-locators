import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { hashShareToken, looksLikeShareToken } from "@/lib/clientShare/token"
import { sendNotification } from "@/lib/notifications/send"
import { absoluteUrl } from "@/lib/notifications/branding"

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
  const { data, error } = await supabase.rpc("lb_record_client_share_view", {
    p_token_hash: hashShareToken(token),
  })
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 })

  // NO ROW = unknown / revoked / disabled share. The RPC recorded nothing, so there is nothing to
  // announce. A clean 200 here means "recorded if recordable" — never an assertion that a view
  // was counted.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { should_notify?: boolean; is_first_view?: boolean; client_first_name?: string | null; locator_email?: string | null; lead_id?: number | null }
    | null

  // AGENT NOTIFICATION. Every rule that decides WHETHER to send lives in the RPC, in the same
  // transaction as the session write — a refresh inside the 30-minute window never reaches a new
  // session, a repeat visit inside 6 hours fails the cooldown, and ?preview=1 never calls this
  // route at all. Here we only deliver what the database already decided.
  if (row?.should_notify && row.locator_email) {
    const first = (row.client_first_name || "Your client").trim()
    // Singular "their", not "her": the client's pronouns are not something the CRM knows, and a
    // guessed one is wrong for a real person every time it misses.
    const subject = row.is_first_view
      ? `${first} just viewed their apartment recommendations`
      : `${first} viewed their apartment recommendations again`
    // Same deep link the new-lead email uses, so the alert opens straight to this client.
    const leadUrl = absoluteUrl(`/admin/leads?id=${row.lead_id}`)
    await sendNotification({
      to: row.locator_email,
      subject,
      html: `<p>${subject}.</p><p><a href="${leadUrl}">Open ${first} in Locator Beast</a></p>`,
      text: `${subject}.\n\nOpen ${first} in Locator Beast: ${leadUrl}`,
    })
  }

  return NextResponse.json({ ok: true })
}
