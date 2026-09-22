import { NextResponse } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"

/**
 * Persist the locator's Working Hours to profiles.work_hours_start / _end (the
 * personal scheduling window for system-generated scheduled Next Actions). Mirrors
 * the timezone route: validates server-side and writes ONLY the caller's own
 * profile (id from the session, never the body). This is a preference, not an
 * authorization boundary — billing is not required.
 *
 * Accepts either a valid window (start in [0,23], end in [1,24], start < end) or
 * an explicit clear (both null) → the app falls back to the 9 AM–9 PM default.
 * The same invariant is enforced by the profiles_work_hours_valid CHECK.
 */
export async function POST(request: Request) {
  const guard = await requireWorkspaceMember({ requireBilling: false })
  if (!guard.ok) return guard.response
  const { userId, supabase } = guard

  const body = await request.json().catch(() => ({}))
  const rawStart = body?.workHoursStart
  const rawEnd = body?.workHoursEnd

  // Explicit clear → both null (revert to the default window).
  const clearing = rawStart == null && rawEnd == null
  let start: number | null = null
  let end: number | null = null

  if (!clearing) {
    start = Number(rawStart)
    end = Number(rawEnd)
    const valid =
      Number.isInteger(start) && Number.isInteger(end) &&
      start >= 0 && start <= 23 && end >= 1 && end <= 24 && start < end
    if (!valid) {
      return NextResponse.json({ error: "Invalid working hours" }, { status: 400 })
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ work_hours_start: start, work_hours_end: end })
    .eq("id", userId)
  if (error) {
    // Server-side only — a PostgrestError names the table/constraint.
    console.error("[admin/profile/work-hours]", error.message)
    return NextResponse.json({ error: "Could not save your working hours." }, { status: 500 })
  }

  return NextResponse.json({ ok: true, workHoursStart: start, workHoursEnd: end })
}
