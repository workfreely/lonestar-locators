export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /property-research?placeId=… — the reusable Verified Property Details for one community.
//
// READ ONLY. This endpoint cannot create or change research; the pilot writes nothing, and the
// enrichment path that eventually does will be its own reviewed route.
//
// AUTHORIZATION IS THE DATABASE'S. The request-scoped client carries the caller's session, so RLS
// decides: an owner sees their own row, an agent sees it only when the owner has actually shared a
// video of that property, and everyone else sees nothing. No owner id is accepted from the caller,
// so the query cannot be pointed at somebody else's research.
export async function GET(request: Request) {
  const placeId = new URL(request.url).searchParams.get("placeId")?.trim()
  // A MISSING place_id MATCHES NOTHING. Returning "no research" is the only safe answer: a blank
  // key must never fall through to "the first row", which would put one building's research on
  // another building's video.
  

  // A MISSING place_id MATCHES NOTHING. Returning "no research" is the only safe answer: a blank
  // key must never fall through to "the first row", which would put one building's research on
  // another building's video.
  if (!placeId) return NextResponse.json({ research: null, reason: "no_place_id" })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("social_property_research")
    .select("place_id, property_name, stable, pricing, sources, unresolved, updated_at")
    .eq("place_id", placeId)
    .maybeSingle()

  if (error) {
    console.error("[property-research] read failed:", error.message)
    return NextResponse.json({ error: "read_failed" }, { status: 500 })
  }
  return NextResponse.json({ research: data ?? null })
}
