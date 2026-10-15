export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { mergeStableResearch } from "@/lib/social/mergeResearch"
import { BUILDING_TYPE_KEY, normalizeBuildingType } from "@/lib/social/buildingTypes"

// GET /property-research?placeId=… — the reusable Verified Property Details for one community.
//
// GET IS READ ONLY. The one write this route allows is the PATCH below, which can set exactly one
// jsonb key (stable.buildingType) and nothing else. Bulk research enrichment still has no HTTP
// path at all — it runs through scripts/social/saveResearch.ts, with its own identity gate.
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

// PATCH /property-research — set or clear ONE key: stable.buildingType.
//
// ── WHY THIS IS NOT PART OF SAVE DRAFT ──────────────────────────────────────────────────────
// Building Type belongs to the PROPERTY, in social_property_research keyed by (owner, place_id).
// The post editor's Save Draft writes a post and its source video. Routing a research write
// through it would mean the post-save path could touch a third table, and every caption,
// headline, hashtag and overlay in that payload would become a write that has to be trusted not
// to differ. This is its own request, so the Save Draft body is byte-for-byte what it is today.
//
// ── WHY ONE KEY, AND WHY mergeStableResearch ────────────────────────────────────────────────
// `stable` holds the verified research for the whole community: architecture, storey counts, floor
// plans, ceiling heights, laundry, parking, amenities, geography. A plain overwrite of that column
// would destroy all of it to save one classification. mergeStableResearch keeps every key it is
// not given — omission KEEPS rather than deletes — so the incoming {buildingType} can only add or
// replace that one key. pricing, sources, unresolved and property_name are never addressed at all.
//
// ── AUTHORIZATION IS THE DATABASE'S ─────────────────────────────────────────────────────────
// The request-scoped client carries the caller's session, so the "owner manages property research"
// policy decides. No service role, no security-definer function, and no owner id accepted from the
// caller: an agent with read-only sharing cannot write, and nobody can point this at another
// owner's research. The row must already exist — this endpoint does not create research, because
// a classification with no researched property behind it is a record of nothing.
//
// HISTORY IS AUTOMATIC: the social_property_research revision trigger watches `stable`, so every
// change here is captured with the exact previous value and is restorable.
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 })
  }
  const b = (body ?? {}) as Record<string, unknown>

  // A BLANK place_id MATCHES NOTHING, exactly as in GET. A video with no matched property has no
  // research row, and falling through to "the first row" would write one building's
  // classification onto another building's research.
  const placeId = typeof b.placeId === "string" ? b.placeId.trim() : ""
  if (!placeId) return NextResponse.json({ error: "no_place_id" }, { status: 400 })

  // Six values or null to clear. A near-miss is refused rather than coerced: `stable` is free-form
  // jsonb, so nothing downstream would stop "High Rise" becoming a seventh vocabulary value.
  const parsed = normalizeBuildingType(b.buildingType)
  if (!parsed.ok) return NextResponse.json({ error: parsed.reason }, { status: 400 })

  const { data: current, error: readError } = await supabase
    .from("social_property_research")
    .select("place_id, stable")
    .eq("place_id", placeId)
    .maybeSingle()
  if (readError) {
    console.error("[property-research] PATCH read failed:", readError.message)
    return NextResponse.json({ error: "read_failed" }, { status: 500 })
  }
  // RLS makes an unreadable row indistinguishable from an absent one, which is the correct answer
  // to give either way: there is nothing here this caller may change.
  if (!current) return NextResponse.json({ error: "no_research" }, { status: 404 })

  const stable = (current.stable ?? {}) as Record<string, unknown>
  // CLEARING is a removal, not a null value. `remove` is what makes the key disappear instead of
  // leaving {"buildingType": null} behind, which would read as "classified as nothing".
  const nextStable = parsed.value === null
    ? mergeStableResearch(stable as never, {}, { remove: [BUILDING_TYPE_KEY] })
    : mergeStableResearch(stable as never, { [BUILDING_TYPE_KEY]: parsed.value } as never)

  const { data: saved, error: writeError } = await supabase
    .from("social_property_research")
    .update({ stable: nextStable })
    .eq("place_id", placeId)
    .select("place_id, stable")
    .maybeSingle()
  if (writeError) {
    console.error("[property-research] PATCH write failed:", writeError.message)
    return NextResponse.json({ error: "write_failed" }, { status: 500 })
  }
  if (!saved) return NextResponse.json({ error: "write_blocked" }, { status: 403 })

  return NextResponse.json({
    buildingType: ((saved.stable ?? {}) as Record<string, unknown>)[BUILDING_TYPE_KEY] ?? null,
    // The caller can show how many videos this one write just described.
    placeId: saved.place_id,
  })
}
