// Companion EXTENSION auth — cryptographic primitives (Milestone B). Pure +
// dependency-free (Node crypto), so it unit-tests without a DB or network.
//
// Deliberately OPAQUE tokens + sha256 hashing (no JWTs), matching LB's existing
// device-token pattern (lib/companion/auth.ts hashToken/generateDeviceToken):
// identity is always resolved server-side from the token, never trusted from
// the request. Access + refresh are separate opaque secrets; only their hashes
// are persisted. This is the EXTENSION analog of the macOS device token —
// distinct prefixes (lbx*) so the two client families never collide.
import crypto from "node:crypto";

export const ACCESS_TTL_SECONDS = 15 * 60; // 15-minute access token
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30-day rotating refresh
export const AUTH_CODE_TTL_SECONDS = 60; // single-use connect code, ~60s
/** Read-only scopes for the first (read-only) integration. */
export const COMPANION_READONLY_SCOPES = ["lead:read"] as const;

export const ACCESS_TOKEN_PREFIX = "lbxa_"; // extension access
export const REFRESH_TOKEN_PREFIX = "lbxr_"; // extension refresh
export const AUTH_CODE_PREFIX = "lbxc_"; // single-use connect code

/** sha256 hex of a secret — what we store/look up (never the secret itself).
 *  Matches lib/companion/auth.ts hashToken so both client families hash alike. */
export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Mint an opaque secret with a client-family prefix. Returns the raw value
 *  (shown/sent ONCE) and its hash (persisted). */
export function mintToken(prefix: string, bytes = 32): { raw: string; hash: string } {
  const raw = prefix + crypto.randomBytes(bytes).toString("base64url");
  return { raw, hash: sha256Hex(raw) };
}

/** Constant-time compare of two ASCII strings (base64url/hex). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// ── PKCE (S256) ──────────────────────────────────────────────────────────────
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url"); // 43-char high-entropy verifier
}
export function codeChallengeS256(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}
/** True iff S256(verifier) matches the challenge stored with the auth code. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  return safeEqual(codeChallengeS256(verifier), challenge);
}
