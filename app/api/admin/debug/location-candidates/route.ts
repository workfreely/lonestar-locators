// TEMPORARY debug route — first-principles candidate-pool check.
//
// Deliberately does NOT use lib/matching/locationIntelligence.ts or
// calculateMatchScore at all. This is a fresh, minimal, fully self-contained
// implementation so eligibility can be verified independently of whatever
// bug(s) may still be hiding in the existing matching library. Plain
// case-insensitive substring checks only — no squash/fuzzy matching.
//
// Does NOT call calculateMatchScore. Does NOT touch fetchProperties. Does
// NOT change ranking, approval logic, or any production behavior.
//
// Matching hierarchy (Steps 4 and 5 are DISABLED per explicit instruction —
// this route currently returns ONLY exact matches, no fallback of any kind,
// so the true size of the exact-match pool can be seen on its own):
//   Step 1: property name contains a lead-area term ("La Cantera", "The Rim")
//   Step 2: property neighborhood contains a lead-area term
//   Step 3: property core ZIP is in the lead area's core ZIPs
//   Step 4: [DISABLED] nearby-area expansion
//   Step 5: [DISABLED] citywide fallback
//
// Safe to delete once debugging is done.
//
// GET /api/admin/debug/location-candidates?leadId=174

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

function norm(s: any): string {
  return String(s || "").toLowerCase().trim()
}

function containsAny(haystack: string, terms: string[]): string | null {
  for (const term of terms) {
    const t = norm(term)
    if (t && haystack.includes(t)) return term
  }
  return null
}

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

    // ─ Resolve the lead's area: find the location_clusters row whose
    //   cluster_name or aliases appear in lead.neighborhoods (plain
    //   substring, both directions, no fuzzy matching) ─
    const { data: clusters, error: clusterError } = await supabaseAdmin
      .from("location_clusters")
      .select("*")

    if (clusterError) return NextResponse.json({ error: clusterError.message }, { status: 500 })

    const leadNeighborhoodText = norm(lead.neighborhoods)
    const leadCluster = (clusters || []).find((c: any) => {
      const nameParts = norm(c.cluster_name).split("/").map((s: string) => s.trim())
      const aliases = (c.aliases || []).map(norm)
      return (
        nameParts.some((part: string) => part && leadNeighborhoodText.includes(part)) ||
        aliases.some((a: string) => a && leadNeighborhoodText.includes(a))
      )
    })

    if (!leadCluster) {
      return NextResponse.json({
        error: `Could not resolve a location_clusters row for lead.neighborhoods="${lead.neighborhoods}"`,
        leadNeighborhoodText,
      })
    }

    // Plain area terms for Steps 1-2: the cluster's name halves + aliases
    const areaTerms: string[] = [
      ...norm(leadCluster.cluster_name).split("/").map((s: string) => s.trim()),
      ...((leadCluster.aliases || []).map(norm)),
    ].filter(Boolean)

    const areaCoreZips: string[] = leadCluster.core_zips || []
    const nearbyClusterIds: string[] = leadCluster.nearby_clusters || [] // resolved, but NOT used — nearby expansion disabled

    // ─ Fetch the same citywide candidate list production uses ─
    const citySlug =
      norm(lead.city).replace(", tx", "").replace(/\s+/g, "-") || "san-antonio"

    const { data: propertyRows, error: propError } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("city_slug", citySlug)
      .limit(50)

    if (propError) return NextResponse.json({ error: propError.message }, { status: 500 })

    const properties = (propertyRows || []).filter((p: any) => p.city_slug === citySlug)

    // ─ True total count for this city, UNBOUNDED by the .limit(50) above —
    //   tells us whether the 50-row cap could be cutting off properties
    //   that would otherwise be in the candidate pool. ─
    const { count: trueCitywideTotal, error: countError } = await supabaseAdmin
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("city_slug", citySlug)

    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })

    // ─ Direct, explicit check for "The Overlook" — both inside the capped
    //   50-row pool AND across the full unbounded table for this city, so
    //   we can tell apart "doesn't exist" from "exists but got cut off by
    //   the .limit(50)". ─
    const overlookInCappedPool = properties.filter((p: any) =>
      norm(p.name).includes("overlook")
    )

    const { data: overlookUnbounded, error: overlookError } = await supabaseAdmin
      .from("properties")
      .select("id, name, city_slug, neighborhood, submarket, zip, zip_code, postal_code")
      .eq("city_slug", citySlug)
      .ilike("name", "%overlook%")

    if (overlookError) return NextResponse.json({ error: overlookError.message }, { status: 500 })

    // ─ Steps 1-3: exact area match ─
    type Result = { property: any; included: boolean; matchedBy: string[] }
    const results: Result[] = properties.map((p: any) => {
      const matchedBy: string[] = []
      const name = norm(p.name)
      const neighborhood = norm(p.neighborhood)
      const postalCode = p.zip || p.zip_code || p.postal_code || null

      if (containsAny(name, areaTerms)) matchedBy.push("property_name")
      if (containsAny(neighborhood, areaTerms)) matchedBy.push("neighborhood")
      if (postalCode && areaCoreZips.includes(String(postalCode))) matchedBy.push("core_zip")

      return { property: p, included: matchedBy.length > 0, matchedBy }
    })

    const exactCount = results.filter((r) => r.included).length

    // Steps 4 (nearby-area expansion) and 5 (citywide fallback) are
    // DISABLED per explicit instruction — this route now returns ONLY
    // Steps 1-3 (property name / neighborhood / core ZIP) so the true
    // size of the exact-match pool can be seen before any fallback logic
    // is reintroduced.
    const usedNearbyExpansion = false
    const usedCitywideFallback = false
    const nearbyExpandedCount = exactCount

    const output = results.map((r) => ({
      property: r.property.name,
      neighborhood: r.property.neighborhood || null,
      submarket: r.property.submarket || null,
      postalCode: r.property.zip || r.property.zip_code || r.property.postal_code || null,
      citySlug: r.property.city_slug || null,
      included: r.included,
      matchedBy: r.matchedBy,
    }))

    return NextResponse.json({
      lead: {
        id: lead.id,
        first_name: lead.first_name,
        last_name: lead.last_name,
        neighborhoods: lead.neighborhoods,
      },
      resolvedLeadArea: {
        clusterId: leadCluster.cluster_id,
        clusterName: leadCluster.cluster_name,
        areaTerms,
        areaCoreZips,
        nearbyClusterIds,
      },
      theOverlookCheck: {
        trueCitywideTotal,
        cappedPoolSize: properties.length,
        wasCappedPoolTruncated: (trueCitywideTotal ?? 0) > properties.length,
        foundInCappedPool: overlookInCappedPool.length > 0,
        foundInCappedPoolDetails: overlookInCappedPool,
        foundAnywhereInCity: (overlookUnbounded || []).length > 0,
        foundAnywhereInCityDetails: overlookUnbounded || [],
      },
      citywideCandidateCount: properties.length,
      exactMatchCount: exactCount,
      nearbyExpandedCount,
      usedNearbyExpansion,
      usedCitywideFallback,
      finalIncludedCount: output.filter((o) => o.included).length,
      results: output,
    })
  } catch (err) {
    console.error("[debug/location-candidates] error:", err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
      },
      { status: 500 }
    )
  }
}
