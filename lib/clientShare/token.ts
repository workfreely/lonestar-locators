import { createHash, randomBytes } from "crypto"

/**
 * Client Recommendation share tokens.
 *
 * Same model as lib/companion/auth.ts device tokens: the raw token is returned
 * ONCE to the caller and never stored — only sha256(raw) is persisted, so a
 * database leak cannot yield a working share URL.
 *
 * Kept in its own module rather than imported from lib/companion/auth.ts because
 * that file pulls in NextResponse for its request guards, and the public page is
 * a server component that has no business importing response helpers.
 */

const PREFIX = "lbr_"

/** A fresh share token. 32 random bytes — not guessable, not enumerable. */
export function generateShareToken(): { raw: string; hash: string; prefix: string } {
  const raw = PREFIX + randomBytes(32).toString("base64url")
  return { raw, hash: hashShareToken(raw), prefix: raw.slice(0, 8) }
}

/**
 * The stored representation. Hashing happens HERE, in Node, rather than inside
 * the Postgres function: it keeps the raw secret out of database statement logs
 * and avoids needing pgcrypto inside a SECURITY DEFINER function with a pinned
 * search_path. Security is equivalent — the hash is only derivable from the raw.
 */
export function hashShareToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

/** Cheap shape check so an obviously-malformed path never reaches the database. */
export function looksLikeShareToken(raw: string): boolean {
  return typeof raw === "string" && raw.startsWith(PREFIX) && raw.length >= 20 && raw.length <= 128
}
