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
// owner's research.
//
// ── IT MAY CREATE THE ROW, AND ONLY THE ROW ─────────────────────────────────────────────────
// A property added to the library today has no research row yet, and that is precisely when
// somebody classifies it. This used to answer 404, which the editor showed as the classification
// snapping back to "Not Verified" — a save that looked like a glitch. It now creates the row, but
// only when: the place_id is one the CATALOG knows (checked through the id-scoped definer RPC, so
// a crafted id cannot mint research), the owner comes from the SESSION, and a real classification
// was chosen — clearing to "Not Verified" on a property with no row stays a no-op. The new row
// carries the classification and nothing else; pricing, sources and unresolved keep their
// defaults, so creating one cannot invent research nobody did.
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

  // ── THE MERGE PATH — used by an existing row, and again if a concurrent first save beat us ──
  // Extracted so the create path can fall back to it on a unique-constraint collision WITHOUT
  // repeating the merge, which is the only thing standing between one classification and the rest
  // of a community's research.
  const mergeExisting = async (): Promise<
    | { kind: "missing" }
    | { kind: "ok"; buildingType: unknown; placeId: string }
    | { kind: "fail"; error: string; status: number }
  > => {
    const { data: current, error: readError } = await supabase
      .from("social_property_research")
      .select("place_id, stable")
      .eq("place_id", placeId)
      .maybeSingle()
    if (readError) {
      console.error("[property-research] PATCH read failed:", readError.message)
      return { kind: "fail", error: "read_failed", status: 500 }
    }
    // RLS makes an unreadable row indistinguishable from an absent one. The caller is told the
    // same thing either way; only the create path below can act on it, and only for a place_id
    // the catalog actually knows.
    if (!current) return { kind: "missing" }

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
      return { kind: "fail", error: "write_failed", status: 500 }
    }
    if (!saved) return { kind: "fail", error: "write_blocked", status: 403 }
    return {
      kind: "ok",
      buildingType: ((saved.stable ?? {}) as Record<string, unknown>)[BUILDING_TYPE_KEY] ?? null,
      placeId: saved.place_id,
    }
  }

  const first = await mergeExisting()
  if (first.kind === "fail") return NextResponse.json({ error: first.error }, { status: first.status })
  if (first.kind === "ok") {
    // The caller can show how many videos this one write just described.
    return NextResponse.json({ buildingType: first.buildingType, placeId: first.placeId, created: false })
  }

  // ── NO ROW YET — a NEWLY ADDED property, researched before the pipeline has ever seen it ────
  // This endpoint used to answer 404 here, which the editor surfaced as the classification
  // silently snapping back to "Not Verified". A property that has just been added to the library
  // is exactly when someone classifies it, so refusing was the wrong answer.

  // CLEARING STAYS A NO-OP. "Not Verified" on a property with no research is already the truth;
  // creating an empty row to record the absence of a classification would be a record of nothing.
  if (parsed.value === null) {
    return NextResponse.json({ buildingType: null, placeId, created: false })
  }

  // IDENTITY GATE. The place_id must be a property the CATALOG knows, so a crafted id cannot mint
  // research for something that does not exist. property_catalog has RLS enabled with no SELECT
  // policy, so a request-scoped client cannot read it directly — this goes through the same
  // id-scoped SECURITY DEFINER RPC every other catalog read uses.
  const { data: catalogRows, error: catalogError } = await supabase.rpc("lb_property_catalog_by_ids", {
    p_place_ids: [placeId],
  })
  if (catalogError) {
    console.error("[property-research] PATCH catalog lookup failed:", catalogError.message)
    return NextResponse.json({ error: "catalog_lookup_failed" }, { status: 500 })
  }
  if (!Array.isArray(catalogRows) || catalogRows.length === 0) {
    return NextResponse.json({ error: "unknown_property" }, { status: 404 })
  }

  // The property's name comes from the CATALOG row we just verified, in the same call — so the
  // new row is self-describing, the name is the canonical one, and this route stays isolated from
  // social_content and social_posts. Never accepted from the request body.
  const catalogRow = (catalogRows[0] ?? {}) as Record<string, unknown>
  const catalogName = typeof catalogRow.property_name === "string" && catalogRow.property_name.trim()
    ? catalogRow.property_name.trim()
    : null

  const { data: created, error: insertError } = await supabase
    .from("social_property_research")
    .insert({
      // FROM THE SESSION, NEVER THE BODY. The request carries no owner id and never could.
      owner_user_id: user.id,
      place_id: placeId,
      property_name: catalogName,
      // Only the classification. pricing, sources and unresolved keep their column defaults, so
      // creating a row cannot invent research that nobody did.
      stable: { [BUILDING_TYPE_KEY]: parsed.value },
    })
    .select("place_id, stable")
    .maybeSingle()

  if (!insertError && created) {
    return NextResponse.json({
      buildingType: ((created.stable ?? {}) as Record<string, unknown>)[BUILDING_TYPE_KEY] ?? null,
      placeId: created.place_id,
      created: true,
    })
  }

  // CONCURRENT FIRST SAVE. Two editors on the same new property both see "no row" and both insert;
  // the unique (owner_user_id, place_id) index lets exactly one win. The loser must NOT overwrite
  // what the winner wrote — an upsert here would replace `stable` wholesale and discard it — so it
  // re-runs the MERGE path instead, which keeps every key it was not given.
  if (insertError && insertError.code === "23505") {
    const second = await mergeExisting()
    if (second.kind === "ok") {
      return NextResponse.json({ buildingType: second.buildingType, placeId: second.placeId, created: false })
    }
    if (second.kind === "fail") return NextResponse.json({ error: second.error }, { status: second.status })
    // Vanished between the collision and the re-read — report rather than loop.
    return NextResponse.json({ error: "write_blocked" }, { status: 409 })
  }

  console.error("[property-research] PATCH create failed:", insertError?.message ?? "no row returned")
  return NextResponse.json({ error: "create_failed" }, { status: 500 })
}
