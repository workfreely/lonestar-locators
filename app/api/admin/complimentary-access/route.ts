export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"

// POST — grant or revoke INTERNAL COMPLIMENTARY ACCESS for one user id.
//
// ── WHY THIS ROUTE EXISTS ───────────────────────────────────────────────────────────────────
// Both grants this performs are reserved to the platform owner BY THE DATABASE:
//
//   lb_set_internal_demo_access   — the licence-verification exemption. profiles.internal_demo_access
//                                   is read-only to everyone else; lb_guard_verified_license raises
//                                   internal_demo_access_readonly (42501) for any non-admin writer,
//                                   including the service role, whose auth.uid() is null.
//   lb_set_complimentary_access   — the billing entitlement. Same shape, same refusal.
//
// Neither can therefore be performed by a migration, a script or a service-role client, and that is
// deliberate — they are owner decisions, not deployment steps. This route is the authenticated door:
// it runs under the signed-in platform admin's own session, so the guards see a real auth.uid() and
// authorize normally. Nothing here weakens or bypasses a guard; it supplies the one thing the guards
// require, which is a request that actually comes from the owner.
//
// ── SCOPE ───────────────────────────────────────────────────────────────────────────────────
// One user id per call, taken from the body and never defaulted. There is no "grant to all", no
// pattern match and no role — the only way to widen this is to call it again with another id.
//
// WHAT IT IS NOT: a licence. The licence columns are never written here. A complimentary grant means
// "this person may use the software for free"; it makes no claim about licensure and authorizes no
// regulated activity.
export async function POST(request: Request) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const b = (body ?? {}) as Record<string, unknown>
  const userId = typeof b.userId === "string" ? b.userId.trim() : ""
  // Explicit, never inferred: an absent `enabled` is a bad request, not a grant.
  const enabled = typeof b.enabled === "boolean" ? b.enabled : null
  const reviewDate = typeof b.reviewDate === "string" && b.reviewDate.trim() ? b.reviewDate.trim() : null
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : null
  // The licence exemption is requested separately, so a billing grant alone is possible and a
  // caller must say when it should also lift the licence wall.
  const licenseExemption = b.licenseExemption === true

  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return NextResponse.json({ error: "userId must be a uuid" }, { status: 400 })
  }
  if (enabled === null) {
    return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 })
  }

  // Billing entitlement. Runs as the admin, so lb_set_complimentary_access authorizes.
  const { data: comp, error: compErr } = await supabase.rpc("lb_set_complimentary_access", {
    p_user: userId,
    p_enabled: enabled,
    p_review_date: reviewDate,
    p_note: note,
  })
  if (compErr) {
    return NextResponse.json({ error: "complimentary_failed", detail: compErr.message }, { status: 400 })
  }

  // Licence exemption, only when asked for. Reported separately so the caller can see which of the
  // two gates was actually changed rather than inferring it from a single boolean.
  let demo: boolean | null = null
  if (licenseExemption) {
    const { data, error } = await supabase.rpc("lb_set_internal_demo_access", {
      p_user: userId,
      p_enabled: enabled,
    })
    if (error) {
      return NextResponse.json(
        { error: "license_exemption_failed", detail: error.message, complimentary: comp },
        { status: 400 },
      )
    }
    demo = data as boolean
  }

  return NextResponse.json({
    ok: true,
    userId,
    complimentaryAccess: comp,
    licenseExemption: demo,
    reviewDate,
    note,
  })
}
