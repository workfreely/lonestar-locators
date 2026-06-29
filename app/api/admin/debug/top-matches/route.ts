// TEMPORARY debug route — returns the top N matched properties for a lead,
// fetched and sorted EXACTLY the way the production Property Matches panel
// does (components/crm/LeadInsights.tsx fetchProperties): strict city_slug
// filter, limit 50, second-chance injection for credit <= 580, scored via
// the real calculateMatchScore, sorted descending by matchScore with no
// secondary tiebreaker. Every per-factor score — including
// rawScoreBeforeNormalization (the unclamped additive total) and
// normalizedMatchScore (after the Math.max(0, Math.min(100, ...)) clamp
// in calculateMatchScore) — is captured straight from calculateMatchScore's
// real debugCapture hook. Nothing here is a re-derived approximation.
// No scoring logic is changed.
//
// Safe to delete once debugging is done.
//
// GET /api/admin/debug/top-matches?leadId=174&limit=25

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import {
  resolveLeadLocationClusters,
  getPropertyLocationSignals,
} from "@/lib/matching/locationIntelligence"
import { calculateMatchScore, type MatchScoreDebugInfo } from "@/lib/matching/calculateMatchScore"

// Verbatim copy of the second-chance fallback list from
// components/crm/LeadInsights.tsx fetchProperties — kept in sync manually
// since this is debug-only and must mirror production exactly.
const SECOND_CHANCE_BY_CITY: Record<string, { name: string }[]> = {
  "san-antonio": [
    { name: "Villas at the Rim" },
    { name: "Mira Vista at La Cantera" },
    { name: "Sedona Ranch Apartments" },
    { name: "Stoneybrook Apartments" },
    { name: "The Estates of Northwoods" },
    { name: "The Lodge at Shavano Park" },
    { name: "The Lodge at Westover Hills" },
    { name: "The Vintage" },
    { name: "Villas at Medical Center" },
    { name: "Villas at Oakwell Farms" },
    { name: "Villas in Westover Hills" },
    { name: "Villas of Vista Del Norte" },
  ],
  "dallas": [
    { name: "Lakeview at Parkside" },
    { name: "Villas at Parkside" },
    { name: "The Springs of Indian Creek" },
    { name: "Rancho Palisades" },
    { name: "Briargrove at Vail" },
    { name: "Carrollton Park of North Dallas" },
    { name: "Estates on Frankford" },
    { name: "Ballantyne Apartments" },
    { name: "Crescent Cove at Lakepointe" },
    { name: "Estancia at Ridgeview Ranch" },
    { name: "Villas of Preston Creek" },
    { name: "Estates of Richardson" },
  ],
  "austin": [{ name: "Onion Creek Luxury Apartments" }],
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const leadId = searchParams.get("leadId") || "174"
    const limit = Number(searchParams.get("limit") || "25")

    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single()

    if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 })
    if (!lead) return NextResponse.json({ error: `No lead found with id "${leadId}"` }, { status: 404 })

    // ─ Mirrors fetchProperties exactly ─
    const citySlug =
      (lead.city || "").toLowerCase().replace(", tx", "").replace(/\s+/g, "-") || "san-antonio"

    const { data, error: propError } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("city_slug", citySlug)
      .limit(50)

    if (propError) return NextResponse.json({ error: propError.message }, { status: 500 })

    const strictCityFiltered = (data || []).filter((p) => p.city_slug === citySlug)
    let baseList: any[] = [...strictCityFiltered]

    const cityKey = (lead.city || "").toLowerCase().replace(", tx", "").trim().replace(/\s+/g, "-")

    if (Number(lead.credit_score) <= 580) {
      const fallback = (SECOND_CHANCE_BY_CITY[cityKey] || []).map((p, i) => ({
        id: `fallback-${i}`,
        name: p.name,
        full_address: "Contact for details",
        submarket: "Second Chance Option",
        rent: "Call for pricing",
        beds: "-",
        sqft: "-",
        isFallback: true,
      }))
      baseList = [...baseList, ...fallback]
    }

    const leadClusters = await resolveLeadLocationClusters(lead)
    const propertySignals = await Promise.all(baseList.map((p) => getPropertyLocationSignals(p)))

    const scored = baseList.map((p, i) => {
      const captured: MatchScoreDebugInfo[] = []

      const matchScore = calculateMatchScore(
        p,
        lead,
        { leadClusters, propertyClusters: propertySignals[i].matchedClusters },
        (info) => {
          captured.push(info)
        }
      )

      const debugInfo = captured[0]

      return {
        propertyName: p.name,
        isFallback: !!p.isFallback,
        finalMatchScore: matchScore,
        rawScoreBeforeNormalization: debugInfo?.rawScoreBeforeNormalization ?? null,
        normalizedMatchScore: debugInfo?.normalizedMatchScore ?? null,
        cityScore: debugInfo?.cityScore ?? null,
        locationKeywordScore: debugInfo?.locationKeywordScore ?? null,
        locationClusterScore: debugInfo?.locationPointsAdded ?? null,
        budgetScore: debugInfo?.budgetScore ?? null,
        bedroomScore: debugInfo?.bedroomScore ?? null,
        propertyTypeScore: debugInfo?.propertyTypeScore ?? null,
        managementScore: debugInfo?.managementScore ?? null,
        propertyClusters: propertySignals[i].matchedClusters.map((c) => c.cluster_name),
      }
    })

    // EXACT production sort: scored.sort((a, b) => b.matchScore - a.matchScore)
    scored.sort((a, b) => b.finalMatchScore - a.finalMatchScore)

    return NextResponse.json({
      lead: {
        id: lead.id,
        first_name: lead.first_name,
        last_name: lead.last_name,
        city: lead.city,
        citySlugUsedForQuery: citySlug,
        credit_score: lead.credit_score,
        desired_rent: lead.desired_rent,
        beds: lead.beds,
        property_type: lead.property_type,
      },
      leadClusters: leadClusters.map((c) => c.cluster_name),
      totalCandidates: baseList.length,
      top: scored.slice(0, limit),
    })
  } catch (err) {
    console.error("[debug/top-matches] error:", err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
      },
      { status: 500 }
    )
  }
}
