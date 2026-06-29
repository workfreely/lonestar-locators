// TEMPORARY debug route — verifies the simplified primary-location
// candidate-pool filter (lib/matching/locationIntelligence.ts:
// resolveLeadPrimaryCluster, resolvePropertyPrimaryCluster,
// selectLocationCandidates) BEFORE it is wired into production
// fetchProperties (components/crm/LeadInsights.tsx).
//
// Mirrors the same citywide fetch + second-chance injection used by
// production, resolves each property's SINGLE primary cluster (name >
// neighborhood/submarket > core ZIP > landmark; corridor keywords and
// nearby ZIPs never qualify), resolves the lead's single primary cluster
// (neighborhoods field first, city/notes fallback), then runs
// selectLocationCandidates on top.
//
// Does NOT call calculateMatchScore, does NOT touch fetchProperties,
// does NOT change any production behavior. Candidate selection only.
//
// Safe to delete once debugging is done.
//
// GET /api/admin/debug/candidate-pool?leadId=174&minCandidates=6

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import {
  resolveLeadPrimaryCluster,
  resolvePropertyPrimaryCluster,
  selectLocationCandidates,
} from "@/lib/matching/locationIntelligence"

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
    const minCandidates = Number(searchParams.get("minCandidates") || "6")

    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single()

    if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 })
    if (!lead) return NextResponse.json({ error: `No lead found with id "${leadId}"` }, { status: 404 })

    // ─ Mirrors fetchProperties' citywide fetch exactly ─
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

    const leadPrimary = await resolveLeadPrimaryCluster(lead)
    const propertyPrimaryLocations = await Promise.all(
      baseList.map((p) => resolvePropertyPrimaryCluster(p))
    )

    const result = selectLocationCandidates(baseList, propertyPrimaryLocations, leadPrimary, minCandidates)

    const includedExplained = result.candidates.map((p, i) => {
      const loc = result.candidatePrimaryLocations[i]
      return {
        propertyName: p.name,
        postalCode: p.zip || p.zip_code || p.postal_code || null,
        neighborhoodField: p.neighborhood || null,
        submarketField: p.submarket || null,
        fullAddress: p.full_address || null,
        primaryCluster: loc.primaryCluster?.cluster_name ?? null,
        resolvedBy: loc.resolvedBy,
        confidenceScore: loc.confidenceScore,
      }
    })

    return NextResponse.json({
      lead: {
        id: lead.id,
        first_name: lead.first_name,
        last_name: lead.last_name,
        city: lead.city,
        neighborhoods: lead.neighborhoods,
      },
      leadPrimary: {
        primaryCluster: leadPrimary.primaryCluster?.cluster_name ?? null,
        resolvedBy: leadPrimary.resolvedBy,
        confidenceScore: leadPrimary.confidenceScore,
      },
      citywideCandidateCount: baseList.length,
      exactMatchCount: result.exactMatchCount,
      nearbyExpandedCount: result.nearbyExpandedCount,
      usedNearbyExpansion: result.usedNearbyExpansion,
      usedCitywideFallback: result.usedCitywideFallback,
      finalCandidatePoolSize: result.candidates.length,
      acceptedClusterIds: result.acceptedClusterIds,
      excludedProperties: result.debugEntries.filter((e) => !e.included),
      includedProperties: includedExplained,
    })
  } catch (err) {
    console.error("[debug/candidate-pool] error:", err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
      },
      { status: 500 }
    )
  }
}
