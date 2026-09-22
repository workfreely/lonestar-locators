import { createHash, randomBytes } from "crypto"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { clientIpFromHeaders } from "@/lib/rateLimit"
import { parseUserAgent } from "@/lib/leads/parseUserAgent"

// Security Beast — Trusted Device RECOGNITION (checkpoint 3).
//
// A device is identified by a cryptographically random opaque credential (NOT a
// fingerprint). Same model as lib/clientShare/token.ts: the raw credential is
// generated server-side, returned to the browser ONCE in an httpOnly cookie, and
// only sha256(raw) is persisted (public.trusted_devices.token_hash). The raw
// value never touches the database, never reaches JavaScript, and is never logged
// or written to security_events.

// Cookie that carries the raw device credential. httpOnly so JS can never read
// it; Secure in production; SameSite=Lax so it is still sent on the top-level
// navigation back from the Google OAuth redirect. Mirrors referralCookieOptions.
export const DEVICE_COOKIE = "lb_device"
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400 // 400 days (browser cap), seconds

export function deviceCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE,
  }
}

// Opaque device credential: prefix + 32 random bytes (256-bit). Not guessable,
// not enumerable. Prefix is cosmetic, aiding a cheap shape check before hashing.
const DEVICE_TOKEN_PREFIX = "lbd_"

function generateDeviceToken(): string {
  return DEVICE_TOKEN_PREFIX + randomBytes(32).toString("base64url")
}
function hashDeviceToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}
function looksLikeDeviceToken(v: string): boolean {
  return v.startsWith(DEVICE_TOKEN_PREFIX) && v.length >= DEVICE_TOKEN_PREFIX.length + 40
}

export type DeviceRecognition = {
  // "recognized" — a known, non-revoked device for THIS user was presented.
  // "new"        — no matching device for this user; a fresh one was enrolled.
  // "unavailable"— device infrastructure failed; login proceeds regardless.
  status: "recognized" | "new" | "unavailable"
  // The trusted_devices row id — a NON-SECRET identifier safe to reference from a
  // security_events row. Null when unavailable.
  deviceId: string | null
  // Present ONLY when a fresh credential must be written to the response cookie
  // (i.e. status "new"). The raw credential — set it httpOnly and never log it.
  newCookieValue?: string
}

// Recognize the presented device cookie for the authenticated user, or enroll a
// new device. ALWAYS keyed to `userId` (resolved server-side from the session),
// so User A's cookie can never make User B look recognized — a mismatch is
// treated as a new device and a fresh credential is minted for User B.
//
// BEST-EFFORT + FAIL-OPEN: never throws. On any failure it returns "unavailable"
// so the caller still completes login; only an error message is logged (never the
// raw credential, hash, or cookie value).
export async function recognizeOrEnrollDevice(input: {
  userId: string
  presentedCookie: string | null | undefined
  headers: Headers
}): Promise<DeviceRecognition> {
  try {
    const ua = parseUserAgent(input.headers.get("user-agent"))
    const rawIp = clientIpFromHeaders(input.headers)
    const ip = rawIp === "unknown" ? null : rawIp

    // 1) Try to recognize an existing device for THIS user.
    if (input.presentedCookie && looksLikeDeviceToken(input.presentedCookie)) {
      const hash = hashDeviceToken(input.presentedCookie)
      const { data: existing } = await supabaseAdmin
        .from("trusted_devices")
        .select("id, user_id, revoked_at")
        .eq("token_hash", hash)
        .maybeSingle()

      // Recognized only if the hash maps to a NON-revoked row owned by THIS user.
      if (existing && existing.user_id === input.userId && !existing.revoked_at) {
        await supabaseAdmin
          .from("trusted_devices")
          .update({
            last_seen_at: new Date().toISOString(),
            last_ip: ip,
            device_type: ua.deviceType,
            browser: ua.browser,
            operating_system: ua.operatingSystem,
          })
          .eq("id", existing.id)
        return { status: "recognized", deviceId: existing.id }
      }
    }

    // 2) New / unrecognized device — mint a fresh credential and enroll it for
    //    THIS user. (A cookie belonging to another user, a revoked device, or no
    //    cookie all land here; the unique token_hash guarantees no collision.)
    const raw = generateDeviceToken()
    const { data: inserted } = await supabaseAdmin
      .from("trusted_devices")
      .insert({
        user_id: input.userId,
        token_hash: hashDeviceToken(raw),
        device_type: ua.deviceType,
        browser: ua.browser,
        operating_system: ua.operatingSystem,
        last_ip: ip,
      })
      .select("id")
      .single()

    return { status: "new", deviceId: inserted?.id ?? null, newCookieValue: raw }
  } catch (e) {
    console.error("[trusted-device] recognize error:", e instanceof Error ? e.message : "unknown")
    return { status: "unavailable", deviceId: null }
  }
}
