// TEMPORARY debug route — full per-factor match-score breakdown for a
// real lead against a list of real properties. The location-score figures
// and realFinalMatchScore call the REAL calculateMatchScore from
// lib/matching/calculateMatchScore.ts (moved there from the "use client"
// LeadInsights.tsx specifically so this server route could import it).
// The other per-factor numbers (city, location keyword, budget, bedrooms,
// property type, management) are mirrored copies of the same formulas for
// display purposes only — the function itself is not duplicated.
// Approval-related factors (credit/eviction/felony) are intentionally
// excluded per standing instruction not to touch approval intelligence.
//
// Safe to delete once debugging is done.
//
// POST { leadId: "<lead_id>", propertyNames: ["Berkshire at the Rim", "Abacus West", "Allora Kinder Ranch"] }

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { MANAGEMENT_PROFILES } from "@/lib/managementProfiles"
import {
  resolveLeadLocationClusters,
  getPropertyLocationSignals,
} from "@/lib/matching/locationIntelligence"
import { calculateMatchScore } from "@/lib/matching/calculateMatchScore"

function extractKeywords(text: string) {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s|,/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2)
}

function parseBeds(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null
  const s = String(raw).toLowerCase().trim()
  if (s === "studio" || s === "0") return 0
  const match = s.match(/\d+/)
  if (!match) return null
  return parseInt(match[0])
}

export async function POST(req: Request) {
  try {
    const { leadId, propertyNames } = await req.json()

    if (!leadId || !Array.isArray(propertyNames)) {
      return NextResponse.json({ error: "leadId and propertyNames[] required" }, { status: 400 })
    }

    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single()

    if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 })
    if (!lead) {
      return NextResponse.json({ error: `No lead found with id "${leadId}"` }, { status: 404 })
    }

    const { data: allProperties, error: propError } = await supabaseAdmin
      .from("properties")
      .select("*")

    if (propError) return NextResponse.json({ error: propError.message }, { status: 500 })

    const properties = propertyNames.map((name: string) => {
      const match = (allProperties || []).find((p) =>
        p.name?.toLowerCase().includes(name.toLowerCase())
      )
      return { requested: name, property: match || null }
    })

    const leadClusters = await resolveLeadLocationClusters(lead)

    const results = await Promise.all(
      properties.map(async ({ requested, property }) => {
        if (!property) {
          return { requested, error: "No matching property found in properties table" }
        }

        const breakdown: Record<string, number> = {}

        // City
        const citySlug = (lead.city || "").toLowerCase().replace(", tx", "").replace(/\s+/g, "-")
        breakdown.citySore = property.city_slug === citySlug ? 10 : 0

        // Location keywords (legacy free-text block)
        const leadText = [lead.neighborhoods, lead.desired_areas, lead.notes].filter(Boolean).join(" ")
        const propertyText = [property.neighborhood, property.submarket, property.full_address]
          .filter(Boolean)
          .join(" ")
        const leadKeywords = extractKeywords(leadText)
        const propertyKeywords = extractKeywords(propertyText)
        const keywordMatches = propertyKeywords.filter((kw) => leadKeywords.includes(kw))
        breakdown.locationKeywordScore = keywordMatches.length > 0 ? Math.min(25, keywordMatches.length * 10) : 0

        // Location Intelligence (cluster-based) — captured from the REAL
        // calculateMatchScore execution via debugCapture, not re-derived.
        const propertySignals = await getPropertyLocationSignals(property)
        let locationDebug: any = null
        const locationContext = { leadClusters, propertyClusters: propertySignals.matchedClusters }
        calculateMatchScore(property, lead, locationContext, (info) => {
          locationDebug = info
        })
        breakdown.locationClusterScore = locationDebug?.locationPointsAdded ?? 0

        // Budget
        const price = Number(property.price_value || 0)
        const rentNumbers = String(lead.desired_rent || "")
          .match(/[\d,]+/g)
          ?.map((n) => Number(n.replace(/,/g, "")))
          .filter((n) => n > 0) ?? []
        const budgetMax = rentNumbers.length > 0 ? Math.max(...rentNumbers) : 0
        let budgetScore = 0
        if (price > 0 && budgetMax > 0) {
          const overRatio = (price - budgetMax) / budgetMax
          if (price <= budgetMax) budgetScore = 8
          else if (overRatio <= 0.2) budgetScore = 4
          else if (overRatio <= 0.4) budgetScore = -5
          else if (overRatio <= 0.6) budgetScore = -10
          else budgetScore = -15
        }
        breakdown.budgetScore = budgetScore

        // Bedrooms
        const leadBeds = parseBeds(lead.beds)
        const propBeds = parseBeds(property.beds)
        let bedroomScore = 0
        if (leadBeds !== null && propBeds !== null) {
          const diff = Math.abs(leadBeds - propBeds)
          bedroomScore = diff === 0 ? 25 : diff === 1 ? 10 : -15
        }
        breakdown.bedroomScore = bedroomScore

        // Property type
        const leadType = String(lead.property_type || "").toLowerCase().trim()
        const propTypeText = [property.property_type, property.name, property.submarket, property.neighborhood]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        let propertyTypeScore = 0
        if (leadType && leadType !== "any" && leadType !== "no preference") {
          const TYPE_SYNONYMS: Record<string, string[]> = {
            apartment: ["apartment", "apt", "flat"],
            townhome: ["townhome", "townhouse", "town home", "town house"],
            house: ["house", "home", "rental home", "single family", "sfr"],
            condo: ["condo", "condominium"],
            "high-rise": ["high-rise", "highrise", "high rise", "luxury high"],
            studio: ["studio"],
            loft: ["loft"],
          }
          const synonyms =
            Object.entries(TYPE_SYNONYMS).find(
              ([key, vals]) => key === leadType || vals.some((v) => leadType.includes(v))
            )?.[1] ?? [leadType]
          const typeMatches = synonyms.some((kw) => propTypeText.includes(kw))
          propertyTypeScore = typeMatches ? 20 : -10
        }
        breakdown.propertyTypeScore = propertyTypeScore

        // Management (non-approval flags only, per standing instruction)
        const management = MANAGEMENT_PROFILES[property.management_company]
        const credit = Number(lead.credit_score || 0)
        let managementScore = 0
        if (credit < 620 && management?.flexibleLowCredit) managementScore += 20
        breakdown.managementScore = managementScore

        // The REAL final score, exactly as fetchProperties computes it in
        // production — includes credit/eviction/felony/broken-lease, which
        // the breakdown above and finalTotalExcludingApproval deliberately
        // omit.
        const realFinalMatchScore = calculateMatchScore(property, lead, locationContext)

        const finalTotal = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              breakdown.citySore +
                breakdown.locationKeywordScore +
                breakdown.locationClusterScore +
                breakdown.budgetScore +
                breakdown.bedroomScore +
                breakdown.propertyTypeScore +
                breakdown.managementScore
            )
          )
        )

        return {
          requested,
          propertyName: property.name,
          leadClusters: leadClusters.map((c) => c.cluster_name),
          propertySignals,
          locationContextReceivedByCalculateMatchScore: locationDebug,
          breakdown,
          finalTotalExcludingApproval: finalTotal,
          realFinalMatchScore,
          note: "finalTotalExcludingApproval omits credit/eviction/felony/broken-lease — realFinalMatchScore is the actual calculateMatchScore() return value used in production.",
        }
      })
    )

    return NextResponse.json({
      lead: {
        id: lead.id,
        first_name: lead.first_name,
        last_name: lead.last_name,
        city: lead.city,
        neighborhoods: lead.neighborhoods,
        desired_areas: lead.desired_areas,
        notes: lead.notes,
        desired_rent: lead.desired_rent,
        beds: lead.beds,
        property_type: lead.property_type,
        credit_score: lead.credit_score,
      },
      leadClusters,
      results,
    })
  } catch (err) {
    console.error("[debug/match-breakdown] error:", err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
      },
      { status: 500 }
    )
  }
}
