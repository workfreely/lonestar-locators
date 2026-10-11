export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireSocialAgent } from "@/lib/auth/requireSocialAgent"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { isSharedWithAgents } from "@/lib/social/agentMedia"

// POST → the agent's decision on ONE video: approve it for their account, or skip it.
//
// ── THE CONNECTION COMES FROM THE SESSION, NEVER THE BODY ───────────────────────────────────
// The body carries a decision and nothing else. The connection is resolved from
// requireSocialAgent, which derived it from the authenticated user. A caller-supplied connection
// id is how one agent approves a video onto another agent's account, so there is no parameter to
// supply one — not an ignored one, an absent one.
//
// ── ONE ROW PER (VIDEO, CONNECTION, DESTINATION) ────────────────────────────────────────────
// The decision IS a social_posts row. Approving creates or stamps the agent's own row; skipping
// stamps declined_at on the same row. Another agent's decision on the same video is a different
// row on a different connection and is untouched — that is the whole per-account model, and the
// partial unique index from stage 1 is what keeps it to one live row per pair.
//
// ── SERVICE ROLE, DELIBERATELY ──────────────────────────────────────────────────────────────
// Stage 1 added agent SELECT policies and deliberately no INSERT/UPDATE policy, so that exactly
// one place authorizes an agent write and it is reviewable in one file. That place is here. Every
// id in the statements below is session-derived or re-read; none arrives from the caller.
type Body = { decision?: "approve" | "skip" }

export async function POST(req: Request, ctx: { params: Promise<{ contentId: string }> }) {
  const guard = await requireSocialAgent()
  if (!guard.ok) return guard.response
  const { supabase, connectionIds, ownerUserIds } = guard
  const { contentId } = await ctx.params

  let body: Body = {}
  try { body = (await req.json()) as Body } catch { /* fall through to the validation below */ }
  // EXACT MATCH ONLY. Anything that is not one of the two words is a bad request, never a default
  // — a typo must not become an approval.
  if (body.decision !== "approve" && body.decision !== "skip") {
    return NextResponse.json({ error: "bad_decision" }, { status: 400 })
  }

  // RE-READ THE MASTER through the agent's own RLS client. This answers both "does it exist" and
  // "is it still shared", and it answers them NOW rather than trusting a library response the
  // browser may have been holding for an hour.
  const { data: content } = await supabase
    .from("social_content")
    .select("id, owner_user_id, available_to_agents")
    .eq("id", contentId)
    .maybeSingle()
  const row = content as { id: string; owner_user_id: string; available_to_agents: boolean | null } | null
  if (!row || !isSharedWithAgents(row) || !ownerUserIds.includes(row.owner_user_id)) {
    return NextResponse.json({ error: "not_available" }, { status: 404 })
  }

  // The agent's Instagram connection. Today an agent holds one per provider; the first is theirs.
  // Resolved from the SESSION's connection ids, re-read for its provider.
  const { data: conns } = await supabase
    .from("social_connections")
    .select("id, provider")
    .in("id", connectionIds)
  const connection = ((conns ?? []) as { id: string; provider: string }[])
    .find((c) => c.provider === "instagram")
  if (!connection) return NextResponse.json({ error: "no_instagram_account" }, { status: 409 })

  const now = new Date().toISOString()

  // Does this agent already have a row for this video?
  const { data: existing } = await supabaseAdmin
    .from("social_posts")
    .select("id, approved_at, declined_at, published_at")
    .eq("source_content_id", contentId)
    .eq("connection_id", connection.id)
    .eq("destination", "instagram_reel")
    .is("published_at", null)
    .maybeSingle()
  const prior = existing as { id: string; published_at: string | null } | null

  // approved_at and declined_at are mutually exclusive — the stage-1 CHECK enforces it — so each
  // decision clears the other rather than adding to it.
  const decided = body.decision === "approve"
    ? { approved_at: now, declined_at: null }
    : { approved_at: null, declined_at: now }

  if (prior) {
    const { error } = await supabaseAdmin
      .from("social_posts")
      .update({ ...decided, needs_review_at: null, needs_review_reason: null, updated_at: now })
      .eq("id", prior.id)
      // Re-asserted in the WHERE clause: the row must still belong to THIS agent's connection and
      // must still be unpublished. A conditional update is the only form that is safe to race.
      .eq("connection_id", connection.id)
      .is("published_at", null)
    if (error) return NextResponse.json({ error: "decide_failed", detail: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, postId: prior.id, decision: body.decision })
  }

  // No row yet. A SKIP needs one too — it is a decision, and without a row the video would simply
  // reappear as undecided on the next load.
  const { data: made, error: insErr } = await supabaseAdmin
    .from("social_posts")
    .insert({
      owner_user_id: row.owner_user_id,   // the LIBRARY owner, not the agent: the master is his
      // NO agent_user_id HERE — social_posts has no such column, and it does not need one. WHICH
      // agent a post belongs to is already answered by connection_id -> social_connections
      // .agent_user_id, which is the single source the RLS policies, the library scoping and the
      // publishing hold all read. A second copy on the post could disagree with it.
      source_content_id: contentId,
      connection_id: connection.id,
      platform: "instagram",
      destination: "instagram_reel",
      status: "draft",
      // created_via is CHECK-constrained to 'edit_initial' | 'variation' | NULL. An agent's claim
      // is neither of those, and widening a constraint that guards every writer in order to label
      // one of them is the wrong trade — WHICH agent owns this row is already answered by
      // connection_id, so the label would be decoration. Left NULL, verified against the real
      // constraint rather than assumed.
      created_via: null,
      ...decided,
    })
    .select("id")
    .maybeSingle()
  if (insErr) {
    // 23505 = the one-live-row-per-(content, connection, destination) index. A concurrent decision
    // from the same agent won; that is the correct outcome, not a fault.
    if ((insErr as { code?: string }).code === "23505") {
      return NextResponse.json({ ok: true, decision: body.decision, note: "already_decided" })
    }
    return NextResponse.json({ error: "decide_failed", detail: insErr.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, postId: made?.id ?? null, decision: body.decision })
}
