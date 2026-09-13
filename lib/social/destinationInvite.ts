import crypto from "node:crypto"

// Beast Social — Destination-authorization invitation tokens (server-side only).
//
// A recipient (e.g. the owner's family member) receives a single private link carrying a
// cryptographically strong RANDOM token. The database stores ONLY the SHA-256 hash of that token
// (sa_create_destination_invitation), so a database read never yields a usable link. The public
// authorize routes hash the presented token and look the invite up by hash. The token grants ONLY
// the ability to authorize one Instagram account as a destination — it is NOT a Supabase session
// and exposes no owner id, Vault id, or backend data.

/** Default lifetime for a new invitation (short-lived, single-use). */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/** 32 random bytes, URL-safe. ~256 bits of entropy — unguessable. */
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url")
}

/** SHA-256 hex of the raw token — the ONLY form persisted. Timing-safe compare not needed because
 *  lookup is by exact hash (a hash miss reveals nothing about other tokens). */
export function hashInviteToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex")
}

/** Basic shape check before we bother hashing/looking up (defense-in-depth, cheap). base64url of
 *  32 bytes is 43 chars; allow a small range in case of trimming/padding variants. */
export function looksLikeInviteToken(raw: string | null | undefined): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(raw)
}

/** The recipient-facing authorize page for a given raw token. */
export function destinationInvitePath(rawToken: string): string {
  return `/authorize/instagram/${encodeURIComponent(rawToken)}`
}
