// Edge-safe share-token SHAPE check — deliberately free of node:crypto so the
// middleware (edge runtime) can reuse the SAME guard the server API and the public
// page use. token.ts re-exports looksLikeShareToken from here, so there is one
// source of truth and existing importers are unchanged.

export const SHARE_TOKEN_PREFIX = "lbr_"

/** Cheap shape check so an obviously-malformed path never reaches the database. */
export function looksLikeShareToken(raw: string): boolean {
  return typeof raw === "string" && raw.startsWith(SHARE_TOKEN_PREFIX) && raw.length >= 20 && raw.length <= 128
}
