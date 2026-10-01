export const runtime = "nodejs"

import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { reattributeForLeadPhone } from "@/lib/companion/attribution"
import { toE164 } from "@/lib/phone/identity"

// POST /api/companion/reattribute  { leadId }
//
// The LATE-ADDITION path. A lead can exist with no phone number — 10 of 26 do
// today — while Beast Sync is already receiving that person's messages and parking
// them unattributed. The moment the locator saves the number, those messages must
// be able to find the lead. This is what they call.
//
// AUTH IS TWO-STEP, on purpose:
//   1. The caller's OWN session reads the lead. That read is RLS-scoped by
//      is_active_workspace_member, so a lead in someone else's workspace comes back
//      as not-found and the request stops here. RLS is doing the authorization.
//   2. The attribution WRITE then uses the service role, because
//      companion_messages is deliberately read-only to members ("Writes are
//      service-role only (the ingest endpoint)"). The workspace it writes within is
//      the one taken from the lead that step 1 already proved the caller can see —
//      never a workspace id from the request body, which the caller controls.
//
// Idempotent and cheap: attribution only ever fills rows whose lead_id is NULL, so
// calling it on every save — including saves that did not touch the phone — does
// nothing the second time. That is what lets the client call it unconditionally
// rather than trying to detect whether the number changed.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 })
  }
  const leadId = (body as { leadId?: unknown })?.leadId
  if (typeof leadId !== "number" && typeof leadId !== "string") {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 })
  }

  // Step 1 — RLS-scoped read. Also the authorization check.
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, phone, phone_e164, workspace_id, deleted_at")
    .eq("id", leadId)
    .single()
  if (leadErr || !lead) return NextResponse.json({ error: "not found" }, { status: 404 })
  if (!lead.workspace_id) {
    // A lead with no workspace cannot be scoped safely, and attribution without a
    // workspace boundary is the one thing that must never happen.
    return NextResponse.json({ error: "lead has no workspace" }, { status: 409 })
  }
  // A deleted lead must not collect messages — the same rule attribution enforces.
  if (lead.deleted_at) return NextResponse.json({ attributed: 0, skipped: "lead deleted" })

  // Prefer the stored identity, but fall back to deriving it from the display
  // value: a lead edited before this migration was applied has `phone` set and
  // `phone_e164` still NULL, and should not be stuck unattributable.
  const identity = lead.phone_e164 ?? toE164(lead.phone)
  if (!identity) {
    // Not an error. No phone, or a number that cannot be a Beast Sync identity
    // (foreign or not dialable) — both are legitimate states.
    return NextResponse.json({ attributed: 0, eligible: false })
  }

  try {
    // Step 2 — service-role write, inside the workspace step 1 authorized.
    const result = await reattributeForLeadPhone(supabaseAdmin, lead.workspace_id as string, identity)
    if (!result) return NextResponse.json({ attributed: 0, eligible: false })

    if (result.conflicts.length > 0) {
      console.warn("[companion/reattribute] ambiguous identity, nothing attributed:", JSON.stringify(result.conflicts))
    }
    return NextResponse.json({
      eligible: true,
      attributed: result.attributed,
      // Surfaced, not hidden: two live leads share this number, so the locator has
      // to say which one these messages belong to. No message was moved.
      ambiguous: result.ambiguous,
      conflicts: result.conflicts,
    })
  } catch (e) {
    console.error("[companion/reattribute] failed:", (e as Error).message)
    return NextResponse.json({ error: "attribution failed" }, { status: 500 })
  }
}
