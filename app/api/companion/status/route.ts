export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requireDeviceToken } from "@/lib/companion/auth"
import {
  getFeatureEntitlement,
  isCompanionMaintenance,
  isVersionSupported,
  MIN_COMPANION_VERSION,
} from "@/lib/companion/entitlement"

// Server-authoritative heartbeat the Companion polls (launch + interval + after
// pushes). Returns everything the client needs to decide its state — it never
// decides access locally:
//   entitled     — workspace may use messages_sync (trial/subscription active)
//   reason       — machine reason string for display
//   syncEnabled  — the net verdict: entitled AND not paused AND not maintenance
//                  AND supported version. When false, the Companion pauses.
//   maintenance  — global service pause
//   updateRequired / minVersion — version kill-switch
//
// A REVOKED device never reaches here: requireDeviceToken 401s, which the
// Companion shows as "disconnected".
export async function GET(req: Request) {
  const auth = await requireDeviceToken(req)
  if (!auth.ok) return auth.response

  const entitlement = await getFeatureEntitlement(auth.userId, auth.workspaceId, "messages_sync")
  const maintenance = isCompanionMaintenance()
  const versionOk = isVersionSupported(auth.appVersion)

  const syncEnabled = entitlement.entitled && !auth.syncPaused && !maintenance && versionOk

  return NextResponse.json({
    entitled: entitlement.entitled,
    reason: entitlement.reason,
    revoked: false,
    syncPaused: auth.syncPaused,
    maintenance,
    updateRequired: !versionOk,
    minVersion: MIN_COMPANION_VERSION,
    syncEnabled,
    serverTime: new Date().toISOString(),
  })
}
