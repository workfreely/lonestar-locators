export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireDeviceToken } from "@/lib/companion/auth"
import { getFeatureEntitlement, isCompanionMaintenance, isVersionSupported } from "@/lib/companion/entitlement"
import { rateLimit } from "@/lib/rateLimit"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { runClaim } from "@/lib/followup/engine"
import { SupabaseFollowupStore } from "@/lib/followup/stores/supabaseStore"

// Beast Sync outbound CLAIM. Auth + entitlement/version/pause gating live here; the
// shared engine core (runClaim) does the re-validation, stale-cancel, and claim,
// exactly as production always has. Nothing is marked sent here — the device acks.
const store = new SupabaseFollowupStore()

export async function GET(req: Request) {
  const auth = await requireDeviceToken(req)
  if (!auth.ok) return auth.response
  const { userId, workspaceId, deviceId, syncPaused, appVersion } = auth

  if (isCompanionMaintenance()) {
    return NextResponse.json({ jobs: [], syncEnabled: false, maintenance: true }, { status: 503 })
  }
  if (!isVersionSupported(appVersion)) {
    return NextResponse.json({ jobs: [], syncEnabled: false, updateRequired: true }, { status: 426 })
  }
  if (syncPaused) {
    return NextResponse.json({ jobs: [], syncEnabled: false, syncPaused: true }, { status: 403 })
  }

  const limit = rateLimit(`companion-outbound:${deviceId}`, 120, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    })
  }

  const entitlement = await getFeatureEntitlement(userId, workspaceId, "messages_sync")
  if (!entitlement.entitled) {
    return NextResponse.json({ jobs: [], entitled: false, reason: entitlement.reason }, { status: 403 })
  }

  const now = new Date()
  const jobs = await runClaim(store, now, deviceId, workspaceId)

  await supabaseAdmin.from("device_tokens").update({ last_used_at: now.toISOString() }).eq("id", deviceId)
  return NextResponse.json({ jobs, syncEnabled: true, serverTime: now.toISOString() })
}
