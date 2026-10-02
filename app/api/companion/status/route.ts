export const runtime = "nodejs"

import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { requireDeviceToken } from "@/lib/companion/auth"
import { supabaseAdmin } from "@/lib/supabase/admin"
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
/** Must match the device_tokens_sync_phase_known CHECK and SyncPhase.wireValue. */
const KNOWN_PHASES = new Set([
  "needs_pairing", "disconnected", "pairing_reset", "needs_full_disk_access",
  "needs_update", "maintenance", "paused", "idle", "syncing", "offline",
])

export async function GET(req: Request) {
  const auth = await requireDeviceToken(req)
  if (!auth.ok) return auth.response

  // DEVICE SELF-REPORT, piggy-backed on the heartbeat so Beast Sync costs no extra
  // request. Only the Mac knows whether it can read chat.db, and without that the
  // CRM cannot tell "Needs Full Disk Access" from a healthy but quiet device.
  //
  // Display only — never an access decision. Entitlement, revocation, pause and
  // version all stay server-authoritative below. A device cannot unpause itself or
  // claim entitlement by reporting a phase.
  //
  // Unknown phases are DROPPED rather than written: the column has a CHECK
  // constraint, so an unrecognised value would fail the whole update and lose the
  // FDA report with it. An older or newer app build therefore degrades to "no phase
  // reported" instead of breaking its own heartbeat.
  {
    const url = new URL(req.url)
    const rawPhase = url.searchParams.get("phase")
    const rawFda = url.searchParams.get("fda")
    const patch: Record<string, unknown> = {}
    if (rawPhase && KNOWN_PHASES.has(rawPhase)) patch.sync_phase = rawPhase
    if (rawFda === "1" || rawFda === "0") patch.fda_granted = rawFda === "1"
    if (Object.keys(patch).length > 0) {
      // Failure is non-fatal: the heartbeat's job is to return the server verdict,
      // and it must keep working if this migration has not been applied yet.
      const { error } = await supabaseAdmin.from("device_tokens").update(patch).eq("id", auth.deviceId)
      if (error) console.warn("[companion/status] device state not recorded:", error.message)
    }
  }

  // ── THE SYNC ALLOWLIST ──────────────────────────────────────────────────────
  //
  // The canonical phone identities of this workspace's live leads. Beast Sync uses
  // them LOCALLY to decide which chat.db conversations to read at all, so a
  // locator's family, friends and unrelated businesses are never uploaded. Before
  // this existed the Mac walked chat.db from ROWID 0 and shipped everything: one
  // accidental run uploaded 7,228 personal messages, none of which matched a lead.
  //
  // PHONE NUMBERS ONLY — deliberately no lead_id. The Mac never needs one, and not
  // sending it means a compromised or modified client cannot assert which lead a
  // message belongs to. Attribution stays server-side and canonical in
  // attributeUnattributedMessages; this list only narrows what gets read.
  //
  // Scoped to auth.workspaceId, which comes from the device token — never from
  // anything the Mac sends. phone_e164 is already the canonical identity written
  // by the phone-identity rules, so no normalization happens here.
  //
  // `identitiesHash` lets the Mac detect "the allowlist changed" (a new client was
  // added, or a number was corrected) without diffing the array every poll.
  let identities: string[] = []
  {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select("phone_e164")
      .eq("workspace_id", auth.workspaceId)
      .is("deleted_at", null)
      .not("phone_e164", "is", null)
    if (error) {
      // Non-fatal: an empty allowlist makes the Mac sync NOTHING, which is the
      // safe direction — it can never fall back to uploading everything.
      console.warn("[companion/status] identities unavailable:", error.message)
    } else {
      identities = Array.from(new Set((data ?? []).map((r) => r.phone_e164 as string))).sort()
    }
  }
  const identitiesHash = createHash("sha256").update(identities.join(",")).digest("hex").slice(0, 16)

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
    // Local read filter for Beast Sync. Phone identities only — see above.
    identities,
    identitiesHash,
    serverTime: new Date().toISOString(),
  })
}
