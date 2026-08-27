import { NextResponse } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { isValidTimeZone } from "@/lib/timezone"

/**
 * Persist the locator's chosen IANA timezone to profiles.timezone (the existing
 * column). Used by the first-login confirmation modal AND the Account Profile
 * "Change" control. Validates the IANA id server-side (never an offset/abbrev),
 * and writes ONLY the caller's own profile (id from the session, never the body).
 *
 * Billing is not required to set a timezone — a lapsed user can still fix this.
 */
export async function POST(request: Request) {
  const guard = await requireWorkspaceMember({ requireBilling: false })
  if (!guard.ok) return guard.response
  const { userId, supabase } = guard

  const body = await request.json().catch(() => ({}))
  const timezone = typeof body?.timezone === "string" ? body.timezone.trim() : ""

  if (!isValidTimeZone(timezone)) {
    return NextResponse.json({ error: "Invalid IANA timezone" }, { status: 400 })
  }

  const { error } = await supabase.from("profiles").update({ timezone }).eq("id", userId)
  if (error) {
    // Server-side only. A PostgrestError message names tables, columns and
    // constraints ("violates check constraint \"profiles_timezone_check\"") —
    // schema detail the client has no use for and an attacker does.
    console.error("[admin/profile/timezone]", error.message)
    return NextResponse.json({ error: "Could not save your timezone." }, { status: 500 })
  }

  return NextResponse.json({ ok: true, timezone })
}
