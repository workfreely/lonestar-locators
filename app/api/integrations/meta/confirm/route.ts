export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { isMetaAdsBetaAllowed } from "@/lib/meta/beta"
import type { MetaAssets } from "@/lib/meta/assets"

// POST → resolve an ambiguous connection: the user picked an ad account (and page/IG if ambiguous).
// The chosen ids MUST appear in the pending row's discovered options (tenant-safe — the user can only
// select assets Meta returned for THEIR grant). Flips the connection to 'connected'.
export async function POST(request: Request) {
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response
  if (!(await isMetaAdsBetaAllowed(guard.supabase, guard.userId))) return NextResponse.json({ error: "beta" }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as { pageId?: string; adAccountId?: string; instagramAccountId?: string }

  const { data: row } = await guard.supabase
    .from("meta_connections")
    .select("connection_status, discovered")
    .eq("workspace_id", guard.workspaceId)
    .eq("provider", "meta")
    .maybeSingle()
  if (!row || row.connection_status !== "pending" || !row.discovered) {
    return NextResponse.json({ error: "no_pending" }, { status: 409 })
  }

  const opts = row.discovered as MetaAssets
  const adAccount = (opts.adAccounts ?? []).find((a) => a.id === body.adAccountId)
  if (!adAccount) return NextResponse.json({ error: "invalid_ad_account" }, { status: 400 })

  // Page: if the user has exactly one page it may be absent from the body — fall back to it.
  const page = body.pageId
    ? (opts.pages ?? []).find((p) => p.id === body.pageId)
    : (opts.pages ?? []).length === 1
      ? opts.pages[0]
      : undefined
  if (!page) return NextResponse.json({ error: "invalid_page" }, { status: 400 })

  const { error } = await guard.supabase.rpc("meta_confirm_assets", {
    p_workspace_id: guard.workspaceId,
    p_page_id: page.id,
    p_page_name: page.name,
    p_ad_account_id: adAccount.id,
    p_ad_account_name: adAccount.name,
    p_instagram_account_id: page.instagramId ?? null,
    p_instagram_username: page.instagramUsername ?? null,
  })
  if (error) return NextResponse.json({ error: "save" }, { status: 500 })
  return NextResponse.json({ status: "connected" })
}
