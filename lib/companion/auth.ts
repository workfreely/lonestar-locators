import { NextResponse } from "next/server"
import { randomBytes, createHash } from "crypto"
import { supabaseAdmin } from "@/lib/supabase/admin"

// Device-token auth for the macOS Companion.
//
// A paired companion holds a long-lived Bearer token. We store ONLY its sha256
// hash (device_tokens.token_hash); the raw token is shown to the companion once
// at pairing and never persisted. The ingest endpoint resolves the token to its
// user + workspace server-side — the companion never sends a trusted id.

const TOKEN_PREFIX = "lbk_"

/** Mint a new raw token + its storage fields. The raw value is returned once. */
export function generateDeviceToken(): { raw: string; hash: string; prefix: string } {
  const raw = TOKEN_PREFIX + randomBytes(32).toString("base64url")
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 8) }
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export type DeviceAuthOk = {
  ok: true
  deviceId: string
  userId: string
  workspaceId: string
}
export type DeviceAuthFail = { ok: false; response: NextResponse }

/**
 * Validates the `Authorization: Bearer <token>` header against device_tokens
 * (service role, hash lookup, not revoked) and returns the resolved identity.
 * Touches last_used_at. Never trusts anything in the request body.
 */
export async function requireDeviceToken(req: Request): Promise<DeviceAuthOk | DeviceAuthFail> {
  const auth = req.headers.get("authorization") || ""
  const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""

  if (!raw.startsWith(TOKEN_PREFIX)) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { data: device } = await supabaseAdmin
    .from("device_tokens")
    .select("id, user_id, workspace_id, revoked_at")
    .eq("token_hash", hashToken(raw))
    .maybeSingle()

  if (!device || device.revoked_at) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  // Best-effort activity stamp — never block ingest on it.
  await supabaseAdmin
    .from("device_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", device.id)

  return { ok: true, deviceId: device.id, userId: device.user_id, workspaceId: device.workspace_id }
}
