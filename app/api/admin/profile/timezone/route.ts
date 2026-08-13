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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, timezone })
}
