// TEMPORARY debug route for lib/matching/laCanteraRimMatch.ts.
//
// Completely independent of calculateMatchScore, locationIntelligence.ts,
// and simpleLocationMatch.ts. No clusters, no nearby clusters, no corridor
// keywords, no landmarks, no aliases, no fuzzy matching, no scoring. Just
// the 4 hardcoded literal checks, run against EVERY San Antonio property
// (unbounded — no .limit(50), since the goal is to see the true full
// matching set, not whatever subset production's capped query happens to
// return).
//
// Does NOT touch fetchProperties. Does NOT change any production
// behavior. Not wired into production.
//
// Safe to delete once verification is done.
//
// GET /api/admin/debug/la-cantera-rim-match?citySlug=san-antonio

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { isLaCanteraRimMatch } from "@/lib/matching/laCanteraRimMatch"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const citySlug = searchParams.get("citySlug") || "san-antonio"

    // Unbounded — every property for this city, not capped at 50.
    const { data: propertyRows, error: propError } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("city_slug", citySlug)

    if (propError) return NextResponse.json({ error: propError.message }, { status: 500 })

    const properties = propertyRows || []
    const results = properties.map((p: any) => isLaCanteraRimMatch(p))
    const matchingProperties = results.filter((r) => r.included)

    return NextResponse.json({
      citySlugUsed: citySlug,
      totalPropertiesScanned: properties.length,
      matchingCount: matchingProperties.length,
      matchingProperties,
      allResults: results,
    })
  } catch (err) {
    console.error("[debug/la-cantera-rim-match] error:", err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
      },
      { status: 500 }
    )
  }
}
