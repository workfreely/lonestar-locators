export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"

// GET ?q=<query> → search existing Locator Beast agents (profiles) for the Add Publishing
// Destination picker. Platform-admin ONLY. Backed by sa_search_agents (SECURITY DEFINER, admin-
// gated) so it never weakens profiles' own-profile-only RLS. Returns SAFE identity fields only
// (id, name, avatar, email) — no auth internals. At most 10 results.
export async function GET(request: Request) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const q = new URL(request.url).searchParams.get("q") ?? ""

  const { data, error } = await supabase.rpc("sa_search_agents", { p_query: q })
  if (error) return NextResponse.json({ error: "search_failed" }, { status: 500 })

  type AgentRow = {
    id: string
    first_name: string | null
    last_name: string | null
    preferred_name: string | null
    profile_photo_url: string | null
    email: string | null
  }
  const agents = ((data ?? []) as AgentRow[]).map((row) => {
    const name =
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.preferred_name || row.email || "Agent"
    return { id: row.id, name, photoUrl: row.profile_photo_url, email: row.email }
  })
  return NextResponse.json({ ok: true, agents })
}
