// TEMPORARY debug route — RAW DATA ONLY. No matching logic, no cluster
// logic, no scoring logic, no fuzzy/substring logic, no filtering beyond
// literal DB-level equality/IN clauses. Exists purely to verify what the
// database actually contains before any matching-pipeline work continues.
//
// Does NOT call calculateMatchScore. Does NOT touch fetchProperties. Does
// NOT change any production behavior.
//
// Safe to delete once verification is done.
//
// GET /api/admin/debug/raw-pipeline-check?leadId=174

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const leadId = searchParams.get("leadId") || "174"

    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single()

    if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 })
    if (!lead) return NextResponse.json({ error: `No lead found with id "${leadId}"` }, { status: 404 })

    const citySlug =
      (lead.city || "").toLowerCase().replace(", tx", "").replace(/\s+/g, "-") || "san-antonio"

    // ─ 1. Total San Antonio property count (unbounded, no .limit) ─
    const { count: totalCount, error: countError } = await supabaseAdmin
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("city_slug", citySlug)

    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })

    // ─ 2 & 3. The EXACT, unmodified production query — no ORDER BY, limit 50 ─
    const { data: cappedRows, error: cappedError } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("city_slug", citySlug)
      .limit(50)

    if (cappedError) return NextResponse.json({ error: cappedError.message }, { status: 500 })

    const overlookInCapped = (cappedRows || []).filter((p: any) =>
      String(p.name || "").toLowerCase().includes("overlook")
    )

    // ─ 4. Full unbounded fetch, ordered by id for a deterministic position ─
    const { data: fullOrderedRows, error: fullError } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("city_slug", citySlug)
      .order("id", { ascending: true })

    if (fullError) return NextResponse.json({ error: fullError.message }, { status: 500 })

    const overlookPositions = (fullOrderedRows || [])
      .map((p: any, i: number) => ({ position: i + 1, id: p.id, name: p.name }))
      .filter((p) => String(p.name || "").toLowerCase().includes("overlook"))

    // ─ 5. Raw, literal equality only — neighborhood exact match OR ZIP exact match ─
    const rawExactNeighborhoodMatches = (fullOrderedRows || []).filter(
      (p: any) => p.neighborhood === "La Cantera/The Rim"
    )

    const zipColumnsToTry = ["zip", "zip_code", "postal_code"]
    const rawZipExactMatches: any[] = []
    const zipColumnErrors: Record<string, string> = {}

    for (const col of zipColumnsToTry) {
      const { data, error } = await supabaseAdmin
        .from("properties")
        .select("*")
        .eq("city_slug", citySlug)
        .in(col, ["78256", "78257"])

      if (error) {
        zipColumnErrors[col] = error.message
      } else if (data && data.length > 0) {
        rawZipExactMatches.push(...data.map((p: any) => ({ ...p, _matchedZipColumn: col })))
      }
    }

    const combinedById = new Map<string, any>()
    for (const p of rawExactNeighborhoodMatches) combinedById.set(String(p.id), p)
    for (const p of rawZipExactMatches) combinedById.set(String(p.id), p)

    return NextResponse.json({
      lead: {
        id: lead.id,
        first_name: lead.first_name,
        last_name: lead.last_name,
        city: lead.city,
        neighborhoods: lead.neighborhoods,
      },
      citySlugUsed: citySlug,

      // 1
      totalSanAntonioPropertyCount: totalCount,

      // 2 & 3
      cappedQueryRowCount: (cappedRows || []).length,
      theOverlookInCappedQuery: overlookInCapped.length > 0,
      theOverlookInCappedQueryDetails: overlookInCapped,

      // 4
      fullDatasetCount: (fullOrderedRows || []).length,
      theOverlookPositionsInFullDataset: overlookPositions,
      positionNote:
        "Position computed under an explicit ORDER BY id ascending, for determinism. The actual production query (.limit(50), no ORDER BY) returns rows in whatever order Postgres happens to pick — this position is illustrative of where it sits in the dataset, not necessarily what production's unordered query would return first.",

      // 5
      rawExactNeighborhoodMatches,
      rawZipExactMatches,
      zipColumnErrors,
      combinedRawMatches: Array.from(combinedById.values()),
    })
  } catch (err) {
    console.error("[debug/raw-pipeline-check] error:", err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
      },
      { status: 500 }
    )
  }
}
