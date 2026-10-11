export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireSocialAgent } from "@/lib/auth/requireSocialAgent"

// GET → "may I see the agent dashboard?" Used by the nav to decide whether to render the entry.
//
// THE ANSWER IS COMPUTED BY THE SAME GUARD that protects the real routes, so the menu can never
// show a link to something the server would refuse — and, more importantly, hiding the link is
// NOT what protects anything. Every agent route re-runs this guard for itself. This endpoint
// exists so the interface can be honest, not so it can be secure.
//
// It deliberately returns 200 with { enabled: false } rather than a 403: the caller is a menu
// asking a question, and a menu that logs an authorization error on every page load for every
// normal user is noise that trains people to ignore real ones.
export async function GET() {
  const guard = await requireSocialAgent()
  if (!guard.ok) return NextResponse.json({ enabled: false })
  return NextResponse.json({ enabled: true, connections: guard.connectionIds.length })
}
