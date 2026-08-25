// Nonce pair for Google Identity Services + supabase.auth.signInWithIdToken().
//
// Google and Supabase need DIFFERENT forms of the SAME value, and confusing them
// is the standard way this integration fails:
//
//   • Google receives the SHA-256 HASH. It embeds that hash in the ID token's
//     `nonce` claim.
//   • Supabase receives the RAW value. It hashes it itself and compares the
//     result against the token's claim.
//
// Hand the same form to both and Supabase rejects the token ("Passed nonce and
// nonce in id_token should either both exist or match"). Hex encoding of the
// digest is deliberate — it is the encoding Supabase's own comparison expects;
// base64 of the same bytes will not match.
//
// A fresh pair MUST be created per sign-in attempt: the raw value is what proves
// this particular token was minted for this particular attempt, so reusing one
// would defeat the replay protection the nonce exists to provide.

export type NoncePair = {
  /** Held only in memory by the app; handed to Supabase. Never sent to Google. */
  raw: string
  /** SHA-256 of `raw`, hex-encoded; handed to Google, never to Supabase. */
  hashed: string
}

export async function createNoncePair(): Promise<NoncePair> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  // Plain base64 (not base64url) — the value is opaque and never travels in a
  // URL, so there is nothing to escape.
  const raw = btoa(String.fromCharCode(...bytes))

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  return { raw, hashed }
}
