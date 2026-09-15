export const runtime = "nodejs"
export const maxDuration = 60

import { NextResponse } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { isMetaAdsBetaAllowed } from "@/lib/meta/beta"
import { syncWorkspaceInsights } from "@/lib/meta/sync"

// POST → manual "Refresh" of this workspace's Meta ad performance (read-only). Requires an active,
// connected Meta connection. Idempotent; failures leave the existing local cache untouched.
export async function POST() {
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response
  if (!(await isMetaAdsBetaAllowed(guard.supabase, guard.userId))) return NextResponse.json({ error: "beta" }, { status: 403 })

  const { data: conn } = await guard.supabase
    .from("meta_connections")
    .select("id, ad_account_id, connection_status")
    .eq("workspace_id", guard.workspaceId)
    .eq("provider", "meta")
    .maybeSingle()
  if (!conn || conn.connection_status !== "connected" || !conn.ad_account_id) {
    return NextResponse.json({ error: "not_connected" }, { status: 409 })
  }

  try {
    const result = await syncWorkspaceInsights(guard.workspaceId, conn.id, conn.ad_account_id)
    return NextResponse.json({ status: "ok", ...result })
  } catch {
    return NextResponse.json({ error: "sync_failed" }, { status: 502 })
  }
}
