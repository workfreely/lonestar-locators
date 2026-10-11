export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireSocialAgent } from "@/lib/auth/requireSocialAgent"
import { signAgentMedia, AGENT_SIGNED_URL_TTL } from "@/lib/social/agentMedia"

// GET → a short-lived signed URL for ONE shared master video, or a refusal.
//
// THE NARROWEST ROUTE IN THE AGENT SURFACE, deliberately. A signed URL is a bearer token: once
// minted it works for anyone holding it until it expires, and it cannot be recalled. So this is
// the one place where "is this agent allowed to see these bytes?" is finally answered, and it is
// answered immediately before signing — never earlier, never by a caller, never by a list.
//
// It mints ONE url for ONE content id per request. The library deliberately does not pre-sign its
// grid: that would mint dozens of bearer tokens on every page load, nearly all unused and all
// live for their full TTL.
//
// The refusal reason is returned because an agent needs to tell "the admin unshared this" from
// "something is broken" — but the reasons are coarse and leak nothing about rows the agent cannot
// see. `not_found` and `not_shared` are both simply "no".
export async function GET(_req: Request, ctx: { params: Promise<{ contentId: string }> }) {
  const guard = await requireSocialAgent()
  if (!guard.ok) return guard.response
  const { supabase, ownerUserIds } = guard
  const { contentId } = await ctx.params

  const res = await signAgentMedia(supabase, { contentId, ownerUserIds })
  if (!res.ok) {
    const status = res.reason === "sign_failed" ? 500 : 404
    return NextResponse.json({ error: res.reason }, { status })
  }
  return NextResponse.json({ url: res.url, expiresInSeconds: AGENT_SIGNED_URL_TTL })
}
