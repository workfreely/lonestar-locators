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

  const citySlug = (lead.city || "")
    .toLowerCase()
    .replace(", tx", "")
    .replace(/\s+/g, "-")

  if (property.city_slug === citySlug) score += 10

  const credit = Number(lead.credit_score || 0)
  const minCredit = Number(property.credit_min || 0)

const hasBrokenLease =
  lead.credit_history === "Broken Lease" ||
  lead.broken_lease === true

const hasEviction =
  lead.credit_history === "Eviction" ||
  lead.eviction === true

const hasCriminal =
  lead.criminal_background &&
  lead.criminal_background !== "None"

const evictionAge = parseInt(lead.eviction_age || "0")

const management =
  MANAGEMENT_PROFILES[
    property.management_company
  ]

  if (minCredit > 0) {
    if (credit >= minCredit) score += 40
    else if (credit >= minCredit - 40) score += 20
    else score -= 25
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
  // Recent eviction = huge penalty
  if (evictionAge > 0 && evictionAge < 2) {
    score -= property.eviction_ok ? 25 : 60
  } else {
    score += property.eviction_ok ? 10 : -45
  }
}

 if (
  hasEviction ||
  hasBrokenLease ||
  credit < 600
) {
    if (
      property.eviction_ok ||
      property.broken_lease_ok ||
      property.guarantor_accepted
    ) {
      score += 20
    }
  }

  const leadText = [lead.desired_areas, lead.notes].filter(Boolean).join(" ")
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
    score += Math.min(40, matches.length * 12)
  }

  const price = Number(property.price_value || 0)
  const budget = Number(
    String(lead.desired_rent || "").replace(/[^0-9]/g, "")
  )

  if (price > 0 && budget > 0) {
    if (price >= budget * 0.8 && price <= budget * 1.3) score += 15
    else if (price <= budget * 1.5) score += 8
  }

  return Math.max(0, Math.min(100, Math.round(score)))
  // =====================
// MANAGEMENT FLEXIBILITY
// =====================

// Low credit boost
if (
  credit < 620 &&
  management?.flexibleLowCredit
) {
  score += 20
}

// Broken lease boost
if (
  hasBrokenLease &&
  management?.flexibleBrokenLease
) {
  score += 20
}

// Eviction boost
if (
  hasEviction &&
  management?.flexibleEviction
) {
  score += 25
}

// Strict felony penalty
if (
  lead.criminal_background === "Felony" &&
  management?.strictFelony
) {
  score -= 40
}
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
  const [selected, setSelected] = useState<number[]>([])

  const approval = getApprovalProbability(lead)
  const close = getCloseProbability(lead)

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

      setProperties(scored.slice(0, 8))
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
                    : selected.includes(index)
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
                  onClick={() => {
                    setSelected((prev) =>
                      prev.includes(index)
                        ? prev.filter((i) => i !== index)
                        : [...prev, index]
                    )
                  }}
                  className={`text-xs px-2 py-1 rounded ${
                    selected.includes(index)
                      ? "bg-green-600 text-white"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  {selected.includes(index) ? "Added" : "Add"}
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