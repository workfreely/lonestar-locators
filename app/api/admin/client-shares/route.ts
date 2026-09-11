import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateShareToken } from "@/lib/clientShare/token"

// Client Recommendation share snapshots — authenticated agent API (CP2).
//
// AUTH MODEL: every operation runs through the caller's OWN Supabase session (the
// SSR client carries their JWT), never the service role. Workspace ownership is
// enforced two ways, both keyed on auth.uid():
//   • POST (mint)  → lb_create_client_share is SECURITY DEFINER but explicitly
//                    checks is_active_workspace_member(<lead's workspace>) and
//                    raises if the caller isn't an active member — surfaced as 403.
//   • GET  (list)  → the table's RLS SELECT policy restricts rows to shares in a
//                    workspace the caller is an active member of.
// So a cross-workspace lead can neither be minted for nor listed. Service role is
// deliberately NOT used — nothing here needs to bypass the caller's own identity.

// POST /api/admin/client-shares  { leadId }  → mint a NEW immutable snapshot + link.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const rawLeadId = (body as { leadId?: unknown } | null)?.leadId
  const leadId = Number(rawLeadId)
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: "valid leadId required" }, { status: 400 })
  }

  // The raw token is generated HERE. Its sha256 hash powers public resolution; the
  // raw itself is passed (as an RPC bind parameter, not inlined SQL) so the function
  // can stash it ENCRYPTED in Supabase Vault — enabling Copy Link to return the
  // exact same URL later without ever storing the raw in plaintext.
  const { raw, hash, prefix } = generateShareToken()

  const { data, error } = await supabase.rpc("lb_create_client_share", {
    p_lead_id: leadId,
    p_token_hash: hash,
    p_token_prefix: prefix,
    p_raw_token: raw,
  })
  if (error) {
    // The membership guard raises "…not a member of this lead's workspace".
    const forbidden = /not a member/i.test(error.message)
    return NextResponse.json(
      { error: forbidden ? "forbidden" : "create_failed" },
      { status: forbidden ? 403 : 500 },
    )
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { share_id?: string; list_number?: number; item_count?: number }
    | undefined

  // Client-facing URL on the current origin (production: https://locatorbeast.com/r/<raw>).
  const url = new URL(`/r/${raw}`, req.nextUrl.origin).toString()

  return NextResponse.json({
    shareId: row?.share_id ?? null,
    listNumber: row?.list_number ?? null,
    itemCount: row?.item_count ?? 0,
    prefix,
    url,
  })
}

// GET /api/admin/client-shares?leadId=NN  → this client's share/list records.
// The raw token is never returned (never stored); only the display prefix is.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const rawLeadId = req.nextUrl.searchParams.get("leadId")
  const leadId = Number(rawLeadId)
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: "valid leadId required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("client_recommendation_shares")
    .select(
      "id, lead_id, list_number, token_prefix, created_at, sent_at, disabled_at, first_viewed_at, last_viewed_at, view_session_count, item_count",
    )
    .eq("lead_id", leadId)
    .order("list_number", { ascending: false })
  if (error) return NextResponse.json({ error: "list_failed" }, { status: 500 })

  const shares = (data ?? []).map((s: Record<string, unknown>) => ({
    id: s.id,
    listNumber: s.list_number,
    prefix: s.token_prefix,
    createdAt: s.created_at,
    sentAt: s.sent_at,
    status: s.disabled_at ? "disabled" : "active",
    itemCount: s.item_count,
    firstViewedAt: s.first_viewed_at,
    lastViewedAt: s.last_viewed_at,
    viewSessionCount: s.view_session_count,
  }))
  return NextResponse.json({ shares })
}
