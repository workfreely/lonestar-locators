// TEMPORARY debug route for lib/matching/propertyTypeFilter.ts.
//
// Verifies exact property_types matching in isolation, before wiring into
// production. No scoring, no calculateMatchScore, no other filters
// involved — just the boolean { included, reason } test against every
// property for the lead's city.
//
// Does NOT touch fetchProperties. Does NOT change any production
// behavior. Not wired into production.
//
// Safe to delete once verification is done.
//
// GET /api/admin/debug/property-type-filter?leadId=174

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { matchesPropertyType } from "@/lib/matching/propertyTypeFilter"

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

    const { data: propertyRows, error: propError } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("city_slug", citySlug)

    if (propError) return NextResponse.json({ error: propError.message }, { status: 500 })

    const properties = propertyRows || []
    const results = properties.map((p: any) => ({
      property: p.name,
      property_types: p.property_types ?? null,
      ...matchesPropertyType(lead.property_type, p),
    }))

    return NextResponse.json({
      lead: {
        id: lead.id,
        first_name: lead.first_name,
        last_name: lead.last_name,
        property_type: lead.property_type,
      },
      citySlugUsed: citySlug,
      totalPropertiesScanned: properties.length,
      matchingCount: results.filter((r) => r.included).length,
      results,
    })
  } catch (err) {
    console.error("[debug/property-type-filter] error:", err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
      },
      { status: 500 }
    )
  }
}
