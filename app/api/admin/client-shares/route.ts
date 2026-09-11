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

// POST /api/admin/client-shares  { leadId }  → prepare the share for this Send List
// cycle: reuse the current UNSENT snapshot if the working Recommendations are
// unchanged, otherwise mint a NEW immutable snapshot. Returns the stable client URL.
//
// Preparing (or copying) does NOT mark the list sent — sent_at is stamped only on the
// explicit "Yes, List Sent" confirmation (PATCH :id { sent: true }).
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

  // A fresh raw token is generated HERE; it is used ONLY if prepare decides to mint a
  // new snapshot (reuse discards it — no orphan Vault secret). When minted, its sha256
  // hash powers public resolution and the raw is stashed ENCRYPTED in Supabase Vault.
  const { raw, hash, prefix } = generateShareToken()

  const { data, error } = await supabase.rpc("lb_prepare_client_share", {
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
    | { share_id?: string; list_number?: number; item_count?: number; reused?: boolean }
    | undefined
  const shareId = row?.share_id ?? null
  if (!shareId) return NextResponse.json({ error: "create_failed" }, { status: 500 })

  // Always resolve the URL through the SAME encrypted-token retrieval path Copy Link
  // uses (Vault decrypt, workspace-gated) — so a reused snapshot returns its exact
  // original URL and a freshly minted one returns the identical value, one code path.
  const { data: urlRaw, error: urlErr } = await supabase.rpc("lb_get_client_share_url", {
    p_share_id: shareId,
  })
  if (urlErr) return NextResponse.json({ error: "link_failed" }, { status: 500 })
  const token = typeof urlRaw === "string" ? urlRaw : null
  if (!token) return NextResponse.json({ error: "link_failed" }, { status: 500 })
  const url = new URL(`/r/${token}`, req.nextUrl.origin).toString()

  return NextResponse.json({
    shareId,
    listNumber: row?.list_number ?? null,
    itemCount: row?.item_count ?? 0,
    reused: row?.reused ?? false,
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
