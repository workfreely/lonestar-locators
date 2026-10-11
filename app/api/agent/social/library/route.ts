export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireSocialAgent } from "@/lib/auth/requireSocialAgent"
import {
  AGENT_CONTENT_COLUMNS, AGENT_POST_COLUMNS, AGENT_PROPERTY_COLUMNS,
  agentStatusOf, selectOf,
} from "@/lib/social/agentPropertyView"

// GET → the agent's read-only library: every master video the admin has SHARED, each annotated
// with this agent's own decision on it.
//
// READ ONLY. No write of any kind is reachable from this file.
//
// ── THREE INDEPENDENT NARROWINGS, NOT ONE ───────────────────────────────────────────────────
//   1. requireSocialAgent   session + beta allowlist + connection ownership
//   2. available_to_agents  the admin's per-video share switch, filtered in SQL
//   3. RLS                  the policies would hide an unshared row even if 2 were forgotten
// Each is sufficient on its own; they are all present because they fail independently.
//
// The agent's DECISION is per connection, so posts are matched on connection_id ∈ the session's
// connections. Another agent's approval of the same video is invisible here by construction —
// it hangs off a connection id this session does not hold.
export async function GET() {
  const guard = await requireSocialAgent()
  if (!guard.ok) return guard.response
  const { supabase, connectionIds, ownerUserIds } = guard

  const { data: contentRows, error: contentErr } = await supabase
    .from("social_content")
    .select(selectOf(AGENT_CONTENT_COLUMNS))
    .eq("available_to_agents", true)
    .in("owner_user_id", ownerUserIds)
    .order("created_at", { ascending: false })
  if (contentErr) return NextResponse.json({ error: "library_failed" }, { status: 500 })

  const content = (contentRows ?? []) as unknown as Record<string, unknown>[]
  if (content.length === 0) return NextResponse.json({ videos: [], connections: connectionIds.length })

  // This agent's own rows for those videos. Scoped by connection, which is the per-account
  // boundary the whole approval model rests on.
  const contentIds = content.map((c) => String(c.id))
  const { data: postRows } = await supabase
    .from("social_posts")
    .select(selectOf(AGENT_POST_COLUMNS))
    .in("source_content_id", contentIds)
    .in("connection_id", connectionIds)
  const posts = (postRows ?? []) as unknown as Record<string, unknown>[]
  const postByContent = new Map<string, Record<string, unknown>>()
  for (const p of posts) postByContent.set(String(p.source_content_id), p)

  // Property facts for the card. Joined by place_id — 110 of 111 master rows carry one — and
  // limited to the allowlisted columns, so an un-allowlisted field is never even fetched.
  const placeIds = [...new Set(content.map((c) => c.place_id).filter(Boolean))] as string[]
  const propByPlace = new Map<string, Record<string, unknown>>()
  if (placeIds.length) {
    const { data: props } = await supabase
      .from("property_catalog")
      .select(selectOf(AGENT_PROPERTY_COLUMNS))
      .in("place_id", placeIds)
    for (const p of (props ?? []) as unknown as Record<string, unknown>[]) propByPlace.set(String(p.place_id), p)
  }

  const videos = content.map((c) => {
    const prop = c.place_id ? propByPlace.get(String(c.place_id)) ?? null : null
    const post = postByContent.get(String(c.id)) ?? null
    return {
      contentId: c.id,
      // The catalog name is authoritative; the content row's is the admin's working label.
      propertyName: (prop?.property_name as string | null) ?? (c.property_name as string | null) ?? (c.display_name as string | null),
      city: (prop?.city as string | null) ?? (c.market as string | null),
      propertyType: c.property_type ?? null,
      startingPrice: startingPriceOf(prop, c),
      pricingLastVerified: (prop?.pricing_last_verified as string | null) ?? null,
      durationSeconds: c.duration_s ?? null,
      status: agentStatusOf(post as never),
      // The id of THIS agent's row, when a decision exists. Null means undecided.
      postId: (post?.id as string | null) ?? null,
      scheduledAt: (post?.scheduled_at as string | null) ?? null,
      // Media is NOT signed here. A list of bearer tokens would be minted on every page load,
      // most never used and all valid for their full TTL. The player asks for one per video.
      mediaUrl: null as string | null,
    }
  })

  return NextResponse.json({ videos, connections: connectionIds.length })
}

/** The headline price for a card: the catalog's verified floor when present, else the admin's
 *  own budget_range text. Never invented, and never a zero. */
function startingPriceOf(prop: Record<string, unknown> | null, content: Record<string, unknown>): string | null {
  const n = prop?.rent_min
  if (typeof n === "number" && n > 0) return `$${n.toLocaleString("en-US")}/mo`
  const raw = (content.budget_range as string | null) ?? null
  return raw && raw.trim() ? raw.trim() : null
}
