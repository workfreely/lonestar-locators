"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"

import { MANAGEMENT_PROFILES }
from "@/lib/managementProfiles"

// 🔥 KEYWORD EXTRACTOR
function extractKeywords(text: string) {
  if (!text) return []

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s|,/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2)
}

// 🔥 MATCH SCORING (APPROVAL FIRST)
function calculateMatchScore(property: any, lead: any) {
  let score = 0

  // =====================
  // CITY
  // =====================
  const citySlug = (lead.city || "")
    .toLowerCase()
    .replace(", tx", "")
    .replace(/\s+/g, "-")

  if (property.city_slug === citySlug) score += 10

  // =====================
  // SHARED DERIVED VALUES
  // =====================
  const credit = Number(lead.credit_score || 0)
  const minCredit = Number(property.credit_min || 0)

  const hasBrokenLease =
    lead.credit_history === "Broken Lease" ||
    lead.broken_lease === true

  const hasEviction =
    lead.credit_history === "Eviction" ||
    lead.eviction === true

  const evictionAge = parseInt(lead.eviction_age || "0")

  const management = MANAGEMENT_PROFILES[property.management_company]

  // =====================
  // CREDIT
  // =====================
  if (minCredit > 0) {
    if (credit >= minCredit) score += 30
    else if (credit >= minCredit - 40) score += 15
    else score -= 20
  }

  // =====================
  // BROKEN LEASE
  // =====================
  if (hasBrokenLease) {
    score += property.broken_lease_ok ? 15 : -35
  }

  // =====================
  // EVICTION
  // =====================
  if (hasEviction) {
    if (evictionAge > 0 && evictionAge < 2) {
      // Recent eviction: light penalty if property accepts it, heavy if not
      score += property.eviction_ok ? -10 : -60
    } else {
      // Older eviction: reward eviction-friendly properties
      score += property.eviction_ok ? 10 : -45
    }
  }

  // Flexible-risk compound boost
  if (hasEviction || hasBrokenLease || credit < 600) {
    if (
      property.eviction_ok ||
      property.broken_lease_ok ||
      property.guarantor_accepted
    ) {
      score += 20
    }
  }

  // =====================
  // CRIMINAL BACKGROUND
  // =====================
  if (lead.criminal_background === "Felony") {
    if (property.felony_ok === true) score += 15
    else if (property.felony_ok === false) score -= 40
    // null/undefined = unknown, no change
  } else if (lead.criminal_background === "Misdemeanor") {
    if (property.misdemeanor_ok === true) score += 10
    else if (property.misdemeanor_ok === false) score -= 20
  }

  // =====================
  // BEDROOMS
  // =====================
  // Normalize a beds string to a numeric count.
  // Handles: "2 beds", "2-3", "3+", "Studio", "1", etc.
  function parseBeds(raw: string | number | null | undefined): number | null {
    if (raw === null || raw === undefined || raw === "") return null
    const s = String(raw).toLowerCase().trim()
    if (s === "studio" || s === "0") return 0
    const match = s.match(/\d+/)
    if (!match) return null
    return parseInt(match[0])
  }

  const leadBeds = parseBeds(lead.beds)
  const propBeds = parseBeds(property.beds)

  if (leadBeds !== null && propBeds !== null) {
    const diff = Math.abs(leadBeds - propBeds)
    if (diff === 0) score += 25       // exact match
    else if (diff === 1) score += 10  // one off
    else score -= 15                  // two or more away
  }

  // =====================
  // PROPERTY TYPE
  // =====================
  // Normalize and keyword-match lead's desired type against property fields.
  const leadType = String(lead.property_type || "").toLowerCase().trim()
  const propTypeText = [
    property.property_type,
    property.name,
    property.submarket,
    property.neighborhood,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (leadType && leadType !== "any" && leadType !== "no preference") {
    // Define keyword groups so "townhome" matches "townhomes", "house" matches "home", etc.
    const TYPE_SYNONYMS: Record<string, string[]> = {
      apartment:  ["apartment", "apt", "flat"],
      townhome:   ["townhome", "townhouse", "town home", "town house"],
      house:      ["house", "home", "rental home", "single family", "sfr"],
      condo:      ["condo", "condominium"],
      "high-rise":["high-rise", "highrise", "high rise", "luxury high"],
      studio:     ["studio"],
      loft:       ["loft"],
    }

    // Find which synonym group the lead type belongs to
    const synonyms = Object.entries(TYPE_SYNONYMS).find(([key, vals]) =>
      key === leadType || vals.some((v) => leadType.includes(v))
    )?.[1] ?? [leadType]

    const typeMatches = synonyms.some((kw) => propTypeText.includes(kw))

    if (typeMatches) score += 20
    else score -= 10
  }

  // =====================
  // LOCATION KEYWORDS
  // =====================
  const leadText = [lead.neighborhoods, lead.desired_areas, lead.notes]
    .filter(Boolean)
    .join(" ")
  const propertyText = [
    property.neighborhood,
    property.submarket,
    property.full_address,
  ]
    .filter(Boolean)
    .join(" ")

  const leadKeywords = extractKeywords(leadText)
  const propertyKeywords = extractKeywords(propertyText)

  const matches = propertyKeywords.filter((kw) =>
    leadKeywords.includes(kw)
  )

  if (matches.length > 0) {
    score += Math.min(25, matches.length * 10)
  }

  // =====================
  // BUDGET (guideline, not hard filter)
  // Extract all digit groups so "$1,200 - $1,500" → [1200, 1500]
  // =====================
  const price = Number(property.price_value || 0)

  const rentNumbers = String(lead.desired_rent || "")
    .match(/[\d,]+/g)
    ?.map((n) => Number(n.replace(/,/g, "")))
    .filter((n) => n > 0) ?? []

  const budgetMin = rentNumbers.length > 0 ? Math.min(...rentNumbers) : 0
  const budgetMax = rentNumbers.length > 0 ? Math.max(...rentNumbers) : 0

  if (price > 0 && budgetMax > 0) {
    const overRatio = (price - budgetMax) / budgetMax  // negative = under budget

    if (price <= budgetMax) {
      score += 8                             // at or under budget: small positive
    } else if (overRatio <= 0.20) {
      score += 4                             // up to 20% over: concession territory
    } else if (overRatio <= 0.40) {
      score -= 5                             // 20–40% over: mild flag
    } else if (overRatio <= 0.60) {
      score -= 10                            // 40–60% over: notable flag
    } else {
      score -= 15                            // 60%+ over: strong flag
    }
  }

  // =====================
  // MANAGEMENT FLEXIBILITY
  // =====================
  if (credit < 620 && management?.flexibleLowCredit) {
    score += 20
  }

  if (hasBrokenLease && management?.flexibleBrokenLease) {
    score += 20
  }

  if (hasEviction && management?.flexibleEviction) {
    score += 25
  }

  if (lead.criminal_background === "Felony" && management?.strictFelony) {
    score -= 40
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

// =====================================================
// 🔥 APPROVAL PROBABILITY
// =====================================================
function getApprovalProbability(lead: any) {
  const credit = Number(lead.credit_score || 0)

  const history = String(
    lead.credit_history || ""
  ).toLowerCase()

  const hasBrokenLease =
    history.includes("broken")

  const hasEviction =
    history.includes("eviction")

  const hasFelony =
    lead.criminal_background === "Felony"

  // 🚨 HIGH RISK
  if (
    credit <= 580 ||
    hasEviction ||
    hasFelony
  ) {
    return {
      label: "High Risk",
      color: "text-red-600",
    }
  }

  // ⚠️ MEDIUM RISK
  if (
    credit <= 650 ||
    hasBrokenLease
  ) {
    return {
      label: "Medium Risk",
      color: "text-yellow-600",
    }
  }

  // ✅ LOW RISK
  return {
    label: "Low Risk",
    color: "text-green-600",
  }
}

// =====================================================
// 🔥 CLOSE PROBABILITY (STAGE BASED)
// =====================================================
function getCloseProbability(lead: any) {
  const stage = lead.crm_status

  const map: Record<string, { label: string; color: string }> = {
    new: { label: "10%", color: "text-gray-500" },
    contacted: { label: "20%", color: "text-blue-500" },
    qualified: { label: "35%", color: "text-purple-500" },
    list_sent: { label: "50%", color: "text-green-500" },
    ready_to_tour: { label: "65%", color: "text-orange-500" },
    done_touring: { label: "80%", color: "text-yellow-600" },
    applied: { label: "95%", color: "text-emerald-600" },
    closed: { label: "100%", color: "text-green-700" },
  }

  return map[stage] || { label: "0%", color: "text-gray-400" }
}

export default function LeadInsights({
  lead,
  onMatchesChange,
}: {
  lead: any
  onMatchesChange?: (matches: any[]) => void
}) {
  const [properties, setProperties] = useState<any[]>([])
  // Keyed on property.id (string) rather than row index so it survives
  // re-sorts and can be persisted to / hydrated from Supabase.
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())

  const approval = getApprovalProbability(lead)
  const close = getCloseProbability(lead)

  // ── Load existing favorites for this lead from Supabase ──────────────────
  useEffect(() => {
    if (!lead?.id) return

    async function fetchFavorites() {
      const { data, error } = await supabase
        .from("lead_properties")
        .select("property_id")
        .eq("lead_id", lead.id)
        .eq("status", "favorite")

      if (error) {
        console.error("Failed to load favorites:", error)
        return
      }

      setFavoriteIds(new Set((data ?? []).map((r: any) => String(r.property_id))))
    }

    fetchFavorites()
  }, [lead.id])

  // ── Toggle a favorite: insert or delete a lead_properties row ────────────
  async function toggleFavorite(propertyId: string) {
    const id = String(propertyId)
    const isCurrentlyFavorited = favoriteIds.has(id)

    // Optimistic update — reflect the change immediately in the UI
    setFavoriteIds((prev) => {
      const next = new Set(prev)
      if (isCurrentlyFavorited) next.delete(id)
      else next.add(id)
      return next
    })

    if (isCurrentlyFavorited) {
      // Remove the row
      const { error } = await supabase
        .from("lead_properties")
        .delete()
        .eq("lead_id", lead.id)
        .eq("property_id", id)

      if (error) {
        console.error("❌ [lead_properties] DELETE failed")
        console.error("   lead_id      :", lead.id, "(type:", typeof lead.id, ")")
        console.error("   property_id  :", id,      "(type:", typeof id, ")")
        console.error("   error.code   :", error.code)
        console.error("   error.message:", error.message)
        console.error("   error.details:", error.details)
        console.error("   error.hint   :", error.hint)
        console.error("   full error   :", JSON.stringify(error, null, 2))
        // Revert optimistic update on failure
        setFavoriteIds((prev) => { const next = new Set(prev); next.add(id); return next })
      }
    } else {
      // Build the payload explicitly so we can log exactly what is sent
      const payload = {
        lead_id:     lead.id,
        property_id: id,
        status:      "favorite",
      }

      console.log("🔍 [lead_properties] INSERT attempt")
      console.log("   lead_id      :", payload.lead_id,     "(type:", typeof payload.lead_id, ")")
      console.log("   property_id  :", payload.property_id, "(type:", typeof payload.property_id, ")")
      console.log("   status       :", payload.status)
      console.log("   full payload :", JSON.stringify(payload, null, 2))

      const { data, error } = await supabase
        .from("lead_properties")
        .insert(payload)
        .select()

      if (error) {
        console.error("❌ [lead_properties] INSERT failed")
        console.error("   error.code   :", error.code)
        console.error("   error.message:", error.message)
        console.error("   error.details:", error.details)
        console.error("   error.hint   :", error.hint)
        console.error("   full error   :", JSON.stringify(error, null, 2))
        // Revert optimistic update on failure
        setFavoriteIds((prev) => { const next = new Set(prev); next.delete(id); return next })
      } else {
        console.log("✅ [lead_properties] INSERT succeeded:", JSON.stringify(data, null, 2))
      }
    }
  }

  useEffect(() => {
    async function fetchProperties() {
      const citySlug =
        (lead.city || "")
          .toLowerCase()
          .replace(", tx", "")
          .replace(/\s+/g, "-") || "san-antonio"

      const budget =
        Number(
          String(lead.desired_rent || "").replace(/[^0-9]/g, "")
        ) || 2000

      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("city_slug", citySlug)
        .limit(50)

        if (error) {
  console.error(error)
  return
}

// 🔒 STRICT CITY FILTER (NOW SAFE)
const strictCityFiltered = (data || []).filter((p) => {
  return p.city_slug === citySlug
})

const filtered = strictCityFiltered

      // =====================
// 🛟 SECOND CHANCE INJECTION
// =====================
const SECOND_CHANCE_BY_CITY: Record<string, any[]> = {
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
  "austin": [
    { name: "Onion Creek Luxury Apartments" },
  ],
}

const cityKey =
  (lead.city || "")
    .toLowerCase()
    .replace(", tx", "")
    .trim()
    .replace(/\s+/g, "-")

let baseList = [...filtered]

// 🛟 inject ONLY if low credit
if (Number(lead.credit_score) <= 580) {
  const fallback = (SECOND_CHANCE_BY_CITY[cityKey] || []).map((p, i) => ({
    id: `fallback-${i}`,
    name: p.name,
    full_address: "Contact for details",
    submarket: "Second Chance Option",
    rent: "Call for pricing",
    beds: "-",
    sqft: "-",
    matchScore: 85,
    isFallback: true,
  }))

  baseList = [...baseList, ...fallback]
}

      const scored = baseList.map((p) => ({
        ...p,
        matchScore: calculateMatchScore(p, lead),
      }))

      scored.sort((a, b) => b.matchScore - a.matchScore)
      const top3 = scored.slice(0, 3)

      if (onMatchesChange) {
        onMatchesChange(top3)
      }

      setProperties(scored.slice(0, 6))
    }

    fetchProperties()
  }, [lead])

  return (
    <div className="space-y-5 pt-0 -mt-6">

      {/* RECOMMENDED */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b">
 <div className="flex items-center gap-2 flex-wrap">
    
    <h3 className="text-xs font-semibold text-gray-500 whitespace-nowrap">
      RECOMMENDED PROPERTIES:
    </h3>

    <p className="text-[13px] text-gray-400 truncate">
      Showing top {properties.length} matches based on client profile
    </p>

  </div>
</div>

        <div className="divide-y max-h-[520px] overflow-y-auto">
          {properties.map((property, index) => {
            const isTop3 = index < 3

            return (
              <div
                key={property.id}
                className={`flex items-center gap-3 px-4 py-3 transition ${
                  isTop3
                    ? "bg-green-50"
                    : favoriteIds.has(String(property.id))
                    ? "bg-green-50 border-transparent"
                    : "hover:bg-gray-50 border-transparent"
                }`}
              >
                <input type="checkbox" className="h-4 w-4 shrink-0" />

                <div className="h-12 w-14 shrink-0 rounded-md bg-gray-200 overflow-hidden">
                  {property.image ? (
                    <img
                      src={property.image}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[10px] text-gray-400">
                      IMG
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {property.name}
                    </p>

                    <span className={`text-[10px] px-2 py-[2px] rounded ${
                      isTop3
                        ? "bg-green-600 text-white"
                        : "bg-green-100 text-green-700"
                    }`}>
                      {isTop3 ? "Best Match" : "Match"}
                    </span>

                    <span
                      className={`text-[10px] px-2 py-[2px] rounded font-medium ${
                        property.matchScore >= 75
                          ? "bg-green-100 text-green-700"
                          : property.matchScore >= 50
                          ? "bg-yellow-100 text-yellow-700"
                          : property.matchScore >= 30
                          ? "bg-orange-100 text-orange-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {isTop3 ? `🔥 ${property.matchScore}%` : `${property.matchScore}%`}
                    </span>
                  </div>

                  <p className="text-xs text-gray-500 truncate">
                    {property.full_address}
                  </p>

                  <p className="text-xs text-gray-400 truncate">
                    {property.submarket || property.neighborhood} •{" "}
                    {property.special || "No specials"}
                  </p>
                </div>

                <div className="text-right shrink-0 w-[130px]">
                  <p className="text-sm font-semibold text-gray-900">
                    {property.rent}
                  </p>
                  <p className="text-xs text-gray-500">{property.beds}</p>
                  <p className="text-xs text-gray-400">{property.sqft}</p>
                </div>

                <button
                  onClick={() => toggleFavorite(String(property.id))}
                  aria-label={favoriteIds.has(String(property.id)) ? "Remove favorite" : "Mark as favorite"}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors hover:bg-amber-50 active:scale-90"
                >
                  {favoriteIds.has(String(property.id)) ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* INSIGHTS */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="text-xs font-semibold text-gray-500 mb-2">
          INSIGHTS
        </h3>

        <div className="text-xs text-gray-600 space-y-2">

          <div className="flex items-center justify-between">

  {/* APPROVAL LABEL */}
  <span className="bg-green-100 text-green-700 px-2 py-[2px] rounded text-[10px] font-medium">
    Approval Probability
  </span>

  {/* APPROVAL VALUE */}
  <span className="font-semibold text-gray-800">
    {approval.label}
  </span>
</div>

<div className="flex items-center justify-between">

  {/* CLOSE LABEL */}
  <span className="bg-purple-100 text-purple-700 px-2 py-[2px] rounded text-[10px] font-medium">
    Close Ratio
  </span>

  {/* CLOSE VALUE */}
  <span className="font-semibold text-gray-800">
    {close.label}
  </span>
</div>
        </div>
      </div>
    </div>
  )
}