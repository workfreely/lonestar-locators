// TEMPORARY debug route for the new, isolated lib/matching/simpleLocationMatch.ts.
//
// LOCATION ONLY — no credit, no budget, no property type, no bedrooms, no
// management, no score stacking. Proves the simple inclusion rule works
// before any other factor is added back in.
//
// Does NOT call calculateMatchScore. Does NOT call anything in
// lib/matching/locationIntelligence.ts. Does NOT touch fetchProperties.
// Does NOT change any production behavior. Not wired into production.
//
// Safe to delete once verification is done.
//
// GET /api/admin/debug/simple-location-match?leadId=174

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { resolveSimpleLeadArea, simpleLocationMatch } from "@/lib/matching/simpleLocationMatch"

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

    const area = await resolveSimpleLeadArea(lead)
    if (!area) {
      return NextResponse.json({
        error: `Could not resolve a simple lead area from lead.neighborhoods="${lead.neighborhoods}"`,
        lead: { id: lead.id, first_name: lead.first_name, last_name: lead.last_name, neighborhoods: lead.neighborhoods },
      })
    }

    const citySlug =
      (lead.city || "").toLowerCase().replace(", tx", "").replace(/\s+/g, "-") || "san-antonio"

    const { data: propertyRows, error: propError } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("city_slug", citySlug)
      .limit(50)

    if (propError) return NextResponse.json({ error: propError.message }, { status: 500 })

    const properties = (propertyRows || []).filter((p: any) => p.city_slug === citySlug)
    const results = properties.map((p: any) => simpleLocationMatch(p, area))

    return NextResponse.json({
      lead: {
        id: lead.id,
        first_name: lead.first_name,
        last_name: lead.last_name,
        neighborhoods: lead.neighborhoods,
      },
      resolvedArea: area,
      citywideCandidateCount: properties.length,
      includedCount: results.filter((r) => r.included).length,
      excludedCount: results.filter((r) => !r.included).length,
      results,
    })
  } catch (err) {
    console.error("[debug/simple-location-match] error:", err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
      },
      { status: 500 }
    )
  }
}
