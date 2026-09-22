export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"

// Admin-only Approved Agents management for Automated Texting. Platform-admin ONLY
// (requirePlatformAdmin → is_platform_admin, backed by platform_admins which has no
// write policy, so admin status itself is not self-grantable). Agents can NEVER
// authorize themselves: automated_texting_accounts has no client write policy, and
// every mutation here runs through the service role after the admin gate.
//
// Canonical authorization key is auth.users.id. Granting any future Locator Beast
// agent is a row insert here — no migration, no deployment.
//
// INERT: authorization only. Nothing here sends, schedules, or enrolls a lead.

type AgentSearchRow = {
  id: string
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  profile_photo_url: string | null
  email: string | null
}

type ProfileRow = {
  id: string
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  email: string | null
  profile_photo_url: string | null
}

function displayName(r: { first_name: string | null; last_name: string | null; preferred_name: string | null; email: string | null }): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.preferred_name || r.email || "Agent"
}

// GET → the currently approved accounts. With ?q=<query> → also a safe search of
// Locator Beast agents (reusing the admin-gated sa_search_agents SECURITY DEFINER
// RPC) annotated with whether each is already approved.
export async function GET(request: Request) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  // Currently approved accounts + their safe identity (service role: cross-account read).
  const { data: approvedRows, error: apprErr } = await supabaseAdmin
    .from("automated_texting_accounts")
    .select("user_id, granted_at")
    .order("granted_at", { ascending: false })
  if (apprErr) return NextResponse.json({ error: "list_failed" }, { status: 500 })

  const approvedIds = (approvedRows ?? []).map((r) => r.user_id as string)
  let approvedProfiles: Record<string, ProfileRow> = {}
  if (approvedIds.length > 0) {
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, preferred_name, email, profile_photo_url")
      .in("id", approvedIds)
    approvedProfiles = Object.fromEntries(((profs ?? []) as ProfileRow[]).map((p) => [p.id, p]))
  }
  const approved = (approvedRows ?? []).map((r) => {
    const p = approvedProfiles[r.user_id as string]
    return {
      userId: r.user_id as string,
      grantedAt: r.granted_at as string,
      name: p ? displayName(p) : "Agent",
      email: p?.email ?? null,
      photoUrl: p?.profile_photo_url ?? null,
    }
  })

  // Optional agent search for the Grant picker.
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? ""
  let results: { id: string; name: string; email: string | null; photoUrl: string | null; approved: boolean }[] = []
  if (q) {
    const approvedSet = new Set(approvedIds)
    const { data, error } = await supabase.rpc("sa_search_agents", { p_query: q })
    if (error) return NextResponse.json({ error: "search_failed" }, { status: 500 })
    results = ((data ?? []) as AgentSearchRow[]).map((row) => ({
      id: row.id,
      name: displayName(row),
      email: row.email,
      photoUrl: row.profile_photo_url,
      approved: approvedSet.has(row.id),
    }))
  }

  return NextResponse.json({ ok: true, approved, results })
}

// POST { userId, action: "grant" | "revoke" } → mutate approval via the service role.
export async function POST(request: Request) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { userId: adminId } = guard

  let body: { userId?: unknown; action?: unknown } | null = null
  try {
    body = (await request.json()) as { userId?: unknown; action?: unknown }
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }
  const targetUserId = typeof body?.userId === "string" ? body.userId.trim() : ""
  const action = body?.action
  if (!targetUserId || (action !== "grant" && action !== "revoke")) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }

  if (action === "grant") {
    // Idempotent grant. FK to auth.users(id) rejects a non-existent account.
    const { error } = await supabaseAdmin
      .from("automated_texting_accounts")
      .upsert({ user_id: targetUserId, granted_by: adminId }, { onConflict: "user_id" })
    if (error) {
      console.error("[admin/automated-texting] grant failed:", error.message)
      return NextResponse.json({ error: "grant_failed" }, { status: 500 })
    }
  } else {
    const { error } = await supabaseAdmin
      .from("automated_texting_accounts")
      .delete()
      .eq("user_id", targetUserId)
    if (error) {
      console.error("[admin/automated-texting] revoke failed:", error.message)
      return NextResponse.json({ error: "revoke_failed" }, { status: 500 })
    }
  }

  // Best-effort audit (never blocks). Revocation is what makes enrolled leads
  // instantly ineligible via the live send-gate — no per-lead rewrite.
  try {
    await supabaseAdmin.from("security_events").insert({
      user_id: adminId,
      event_type: "automation_authorization",
      metadata: { target_user_id: targetUserId, action },
    })
  } catch (e) {
    console.error("[admin/automated-texting] audit failed:", e instanceof Error ? e.message : "unknown")
  }

  return NextResponse.json({ ok: true, userId: targetUserId, action })
}
