// GOOGLE INTEGRATION — post-reconnect verification. READ-ONLY.
//
// Run: set -a && . ./.env.local && set +a && npx tsx scripts/verifyGoogleIntegration.ts
//
// ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────────────────────
// It creates no contact, no calendar event, no lead, and no follow-up message. Every Google call
// below is a GET. It never touches lead 91 or its pending sequence. There is therefore nothing
// here that could produce a duplicate contact or a duplicate event, and no historical backfill.
//
// ── THE FIVE CHECKS ─────────────────────────────────────────────────────────────────────────
//   1 account email   — from tokeninfo if the scope allows it, else the primary calendar's own
//                       id/summary, which for a primary calendar IS the account address
//   2 refresh token   — a real refresh against Google; this is the only thing that proves it
//   3 both scopes     — the scopes GOOGLE reports as granted, not the ones we stored at consent
//   4 health cleared  — the last_error column the Integrations page reads
//   5 destination     — that "primary" resolves, and to which calendar
//
// Tokens are never printed. The account email is printed because it is the thing being verified.

import { google } from "googleapis"
import { getOAuthClientForUser } from "@/lib/google/getOAuthClientForUser"
import { supabaseAdmin } from "@/lib/supabase/admin"

const OWNER = process.env.VERIFY_OWNER_USER_ID ?? "c567c077-d3f4-4532-8807-a54795f753f5"

const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/calendar.events",
]

function line(n: number, label: string, state: "PASS" | "FAIL" | "INFO", detail: string) {
  const mark = state === "PASS" ? "✓" : state === "FAIL" ? "✗" : "·"
  console.log(`${mark} ${n}. ${label.padEnd(26)} ${detail}`)
}

async function main() {
  console.log(`\nGoogle integration verification — owner ${OWNER}`)
  console.log("Read-only: no contact, event, lead, or message is created.\n")

  // ── 2. the refresh token ──────────────────────────────────────────────────────────────────
  // verify:true forces a refresh against Google. It also clears last_error on success, which is
  // check 4's mechanism.
  const client = await getOAuthClientForUser(OWNER, { verify: true })
  if (!client) {
    line(2, "refresh token", "FAIL", "refresh failed or no credential stored — reconnect required")
    const { data } = await supabaseAdmin
      .from("google_credentials")
      .select("last_error, last_error_at")
      .eq("user_id", OWNER)
      .maybeSingle()
    line(4, "health indicator", "FAIL", `last_error=${data?.last_error ?? "null"} at ${data?.last_error_at ?? "-"}`)
    process.exit(1)
  }
  line(2, "refresh token", "PASS", "refreshed successfully against Google")

  const { token } = await client.getAccessToken()

  // ── 3. the scopes GOOGLE says were granted ────────────────────────────────────────────────
  let granted: string[] = []
  let tokenEmail: string | null = null
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`)
    const info = (await res.json()) as { scope?: string; email?: string }
    granted = (info.scope ?? "").split(/\s+/).filter(Boolean)
    tokenEmail = typeof info.email === "string" ? info.email : null
  } catch {
    /* reported as missing below */
  }
  for (const s of REQUIRED_SCOPES) {
    const short = s.replace("https://www.googleapis.com/auth/", "")
    line(3, `scope ${short}`, granted.includes(s) ? "PASS" : "FAIL", granted.includes(s) ? "granted" : "NOT granted")
  }
  const extra = granted.filter((s) => !REQUIRED_SCOPES.includes(s))
  if (extra.length) line(3, "other scopes granted", "INFO", extra.join(" "))

  // ── 5. the destination calendar (and 1. the account email it reveals) ─────────────────────
  // events.list on "primary" is a GET permitted by calendar.events. The response carries the
  // calendar's own summary; for a primary calendar that is the account address.
  let calendarEmail: string | null = null
  try {
    const cal = google.calendar({ version: "v3", auth: client })
    const res = await cal.events.list({ calendarId: "primary", maxResults: 1, timeMin: new Date().toISOString() })
    calendarEmail = res.data.summary ?? null
    line(5, "destination calendar", "PASS", `primary resolved — summary "${calendarEmail ?? "(none)"}", tz ${res.data.timeZone ?? "?"}`)
  } catch (e) {
    line(5, "destination calendar", "FAIL", `primary did not resolve (${(e as Error).message.slice(0, 80)})`)
  }

  // ── Contacts actually reachable, not merely scoped ───────────────────────────────────────
  try {
    const people = google.people({ version: "v1", auth: client })
    const res = await people.people.connections.list({
      resourceName: "people/me",
      pageSize: 1,
      personFields: "names",
    })
    // COUNT ONLY — no contact name is printed.
    line(3, "contacts API reachable", "PASS", `people.connections.list returned ${res.data.totalPeople ?? 0} total contacts`)
  } catch (e) {
    line(3, "contacts API reachable", "FAIL", (e as Error).message.slice(0, 80))
  }

  // ── 1. the account email ─────────────────────────────────────────────────────────────────
  const { data: cred } = await supabaseAdmin
    .from("google_credentials")
    .select("google_email, scopes, updated_at, last_error, last_error_at")
    .eq("user_id", OWNER)
    .maybeSingle()
  const email = tokenEmail ?? calendarEmail ?? cred?.google_email ?? null
  const source = tokenEmail ? "tokeninfo" : calendarEmail ? "primary calendar summary" : cred?.google_email ? "stored at consent" : "unavailable"
  line(1, "account email", email ? "PASS" : "FAIL", email ? `${email}  (via ${source})` : "could not be determined without an identity scope")

  // ── 4. the health indicator ──────────────────────────────────────────────────────────────
  const cleared = !cred?.last_error && !cred?.last_error_at
  line(4, "health indicator", cleared ? "PASS" : "FAIL", cleared ? "last_error is clear — Integrations shows connected" : `last_error=${cred?.last_error} at ${cred?.last_error_at}`)
  line(4, "credential updated_at", "INFO", String(cred?.updated_at ?? "-"))

  console.log("\nNo Google write was performed.\n")
}

main().catch((e) => {
  console.error("verification failed:", (e as Error).message)
  process.exit(1)
})
