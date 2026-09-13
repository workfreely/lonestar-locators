export const dynamic = "force-dynamic"

import AuthorizeShell from "../AuthorizeShell"

// PUBLIC completion page the recipient lands on after the OAuth callback. Shows ONLY a coarse
// status (connected / used / expired / …) passed in the query string — no token, no owner, no data.
const KNOWN = new Set([
  "connected",
  "used",
  "revoked",
  "expired",
  "invalid",
  "denied",
  "state",
  "exchange",
  "store",
  "no_account",
  "account_taken",
  "not_configured",
])

export default async function AuthorizeCompletePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const status = typeof sp.status === "string" && KNOWN.has(sp.status) ? sp.status : "invalid"
  return <AuthorizeShell state={status} />
}
