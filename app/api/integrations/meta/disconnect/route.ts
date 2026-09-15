export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"

// POST → disconnect the workspace's Meta connection: deletes the Vault token secrets + the row
// (workspace-scoped in the RPC). Idempotent — succeeds even if nothing is connected.
export async function POST() {
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response

  const { error } = await guard.supabase.rpc("meta_disconnect", { p_workspace_id: guard.workspaceId })
  if (error) return NextResponse.json({ error: "disconnect_failed" }, { status: 500 })
  return NextResponse.json({ status: "disconnected" })
}
