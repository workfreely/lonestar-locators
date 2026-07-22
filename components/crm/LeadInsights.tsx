"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import type { AiClientBrief } from "@/lib/types/aiClientBrief"

import { MANAGEMENT_PROFILES }
from "@/lib/managementProfiles"
import { runLocationFilter, LOCATION_FILTER_MAX_SCORE } from "@/lib/matching/filters/locationFilter"
import { runApprovalFilter } from "@/lib/matching/filters/approvalFilter"

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
  // LOCATION FILTER
  // Delegates to the shared, independent Location Filter module — the one
  // production location-scoring implementation, also used by
  // lib/matching/filters/finalRankingEngine.ts. Fully independent of
  // approval/budget/property-type scoring below (see that module for the
  // tier-priority details: Neighborhood > Submarket > Tags > Address).
  // =====================
  const locationResult = runLocationFilter(lead, property)
  score += locationResult.score

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

  // =====================
  // APPROVAL FILTER
  // Placeholder — delegates to the shared Approval Filter module, which
  // always returns score: 0 today (see lib/matching/filters/approvalFilter.ts
  // for prior art / TODOs). Computed here so it's available/verifiable and
  // ready to wire in later, but NOT yet added to `score`.
  //
  // TODO(approval-scoring): once real scoring exists, add it in with:
  //   score += approvalResult.score
  // =====================
  const approvalResult = runApprovalFilter(lead, property)
  void approvalResult // referenced to avoid an unused-var lint error until the TODO above is done

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

  // 🚨 CHALLENGING APPROVAL LIKELIHOOD
  if (
    credit <= 580 ||
    hasEviction ||
    hasFelony
  ) {
    return {
      label: "Low",
      color: "text-red-600",
    }
  }

  // ⚠️ SOME CONCERNS BUT POSSIBLE APPROVAL
  if (
    credit <= 650 ||
    hasBrokenLease
  ) {
    return {
      label: "Moderate",
      color: "text-yellow-600",
    }
  }

  // ✅ STRONG APPROVAL LIKELIHOOD
  return {
    label: "High",
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
    searching: { label: "35%", color: "text-purple-500" },
    list_sent: { label: "50%", color: "text-green-500" },
    ready_to_tour: { label: "65%", color: "text-orange-500" },
    done_touring: { label: "80%", color: "text-yellow-600" },
    applied: { label: "95%", color: "text-emerald-600" },
    closed: { label: "100%", color: "text-green-700" },
  }

  return map[stage] || { label: "0%", color: "text-gray-400" }
}

// ─── AI Insights Card ─────────────────────────────────────────────────────────

function AiInsightsCard({ leadId }: { leadId: string }) {
  const [brief, setBrief] = useState<AiClientBrief | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const initialOpenSet = useRef(false)

  function loadBrief() {
    supabase
      .from("ai_client_briefs")
      .select("*")
      .eq("lead_id", leadId)
      .maybeSingle()
      .then(({ data }) => {
        setBrief(data ?? null)
        if (!initialOpenSet.current) {
          initialOpenSet.current = true
          const hasContent =
            (data?.insights && data.insights.length > 0) ||
            !!data?.last_conversation
          setOpen(hasContent)
        }
      })
  }

  useEffect(() => {
    initialOpenSet.current = false
    setOpen(false)
    loadBrief()
  }, [leadId])

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    try {
      const res = await fetch("/api/ai-insights/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSyncError(json?.error ?? "Sync failed")
      } else {
        loadBrief()
      }
    } catch {
      setSyncError("Network error — please try again.")
    } finally {
      setSyncing(false)
    }
  }

  const hasInsights = brief && brief.insights.length > 0
  const lastSynced = brief?.last_synced_at
    ? new Date(brief.last_synced_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null

  return (
    <div className="bg-white border border-gray-100/70 rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_10px_rgba(15,23,42,0.06)]">
      <div
        className="px-4 py-2 border-b border-gray-100 flex items-center justify-between gap-3 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${open ? "rotate-90" : "rotate-0"}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <h3 className="text-xs font-semibold text-gray-500 whitespace-nowrap">
            🧠 AI INSIGHTS
          </h3>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-[11px] text-gray-400">
            {lastSynced ? `Updated ${lastSynced}` : "Never synced"}
          </span>
          <button
            onClick={handleSync}
            disabled={syncing || !leadId}
            className="text-[11px] text-gray-600 bg-gray-100 border border-gray-300 rounded-full px-2.5 py-0.5 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
          >
            {syncing ? "Syncing..." : lastSynced ? "Refresh" : "Sync"}
          </button>
        </div>
      </div>

      {open && <div className="px-4 py-3 space-y-2">
        {syncError && (
          <p className="text-[12px] text-red-500 italic">{syncError}</p>
        )}

        {hasInsights ? (
          <>
            <ul className="space-y-1.5">
              {brief.insights.map((bullet, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-indigo-400 flex-none" />
                  <span className="text-[12.5px] text-gray-800 leading-snug">{bullet}</span>
                </li>
              ))}
            </ul>

            {brief.last_conversation && (
              <div className="pt-2 border-t border-gray-100">
                <span className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-widest">
                  Last conversation
                </span>
                <p className="text-[12.5px] text-gray-800 mt-1.5 leading-snug">
                  {brief.last_conversation}
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-[12px] text-gray-400 italic py-1">
            {syncError ? null : "No insights yet — sync messages to generate."}
          </p>
        )}
      </div>}
    </div>
  )
}

// ─── LeadInsights ─────────────────────────────────────────────────────────────

export default function LeadInsights({
  lead,
  onMatchesChange,
}: {
  lead: any
  onMatchesChange?: (matches: any[]) => void
}) {
  const [properties, setProperties] = useState<any[]>([])
  const [propertiesOpen, setPropertiesOpen] = useState(true)
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
        // Evaluate every eligible property in the city, not just the first
        // page — 1000 matches the project's own PostgREST max_rows ceiling
        // (supabase/config.toml) and comfortably covers current city sizes.
        .limit(1000)

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
        // Location Filter score, surfaced as a percentage for the existing
        // "Best Match" badge below. Purely a display value — does NOT feed
        // sorting (still driven by matchScore, untouched) or any matching
        // logic. See LOCATION_FILTER_MAX_SCORE in
        // lib/matching/filters/locationFilter.ts for the denominator.
        locationMatchPercent: Math.round(
          (runLocationFilter(lead, p).score / LOCATION_FILTER_MAX_SCORE) * 100
        ),
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
    <div className="space-y-2 pt-0 -mt-6">

      {/* AI INSIGHTS */}
      <AiInsightsCard leadId={String(lead.id)} />

      {/* RECOMMENDED */}
      <div className="bg-white border border-gray-100/70 rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_10px_rgba(15,23,42,0.06)]">
        <div
          className="px-4 py-2 border-b border-gray-100 flex items-center gap-2 cursor-pointer select-none"
          onClick={() => setPropertiesOpen((o) => !o)}
        >
          <svg
            className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${propertiesOpen ? "rotate-90" : "rotate-0"}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <h3 className="text-xs font-semibold text-gray-500 whitespace-nowrap">
            PROPERTY MATCHES {properties.length > 0 && `(${properties.length})`}
          </h3>
          {propertiesOpen && (
            <p className="text-[13px] text-gray-400 truncate">
              AI-ranked based on client preferences
            </p>
          )}
        </div>

        {propertiesOpen && <div className="divide-y max-h-[520px] overflow-y-auto">
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
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="flex-1 min-w-0 text-sm font-semibold text-gray-900 truncate">
                      {property.name}
                    </p>

                    <span className={`shrink-0 whitespace-nowrap text-[10px] px-2 py-[2px] rounded ${
                      isTop3
                        ? "bg-green-600 text-white"
                        : "bg-green-100 text-green-700"
                    }`}>
                      {isTop3 ? "Best Match" : "Match"}
                    </span>

                    <span
                      // Displays the Location Filter score (as a percentage
                      // of its max) — NOT property.matchScore. Still the
                      // same "Best Match"/"Match" badge above; only the
                      // number+color inside this one reflect Location Match
                      // for now. See goal doc: future Approval/Budget/
                      // Property Preference/Final Match badges will join
                      // this later.
                      className={`shrink-0 whitespace-nowrap text-[10px] px-2 py-[2px] rounded font-medium ${
                        property.locationMatchPercent >= 75
                          ? "bg-green-100 text-green-700"
                          : property.locationMatchPercent >= 50
                          ? "bg-yellow-100 text-yellow-700"
                          : property.locationMatchPercent >= 30
                          ? "bg-orange-100 text-orange-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {isTop3 ? `🔥 ${property.locationMatchPercent}%` : `${property.locationMatchPercent}%`}
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
        </div>}
      </div>

      {/* INSIGHTS */}
      <div className="bg-white border border-gray-100/70 rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_10px_rgba(15,23,42,0.06)]">
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