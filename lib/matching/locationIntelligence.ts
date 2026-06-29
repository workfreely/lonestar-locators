// Location Intelligence helpers — detect which location_clusters row(s) a
// property or lead belongs to, using property name, aliases, neighborhood
// text, and ZIP code, resolved by priority so weak signals (ZIP overlap)
// never override strong ones (an explicit name/alias match).
//
// resolveLeadLocationClusters + scoreLocationMatch are consumed by
// calculateMatchScore in lib/matching/calculateMatchScore.ts (pre-resolved
// before scoring, since these are async and calculateMatchScore is not).

import { supabase } from "@/lib/supabase/client"
import type { LocationCluster } from "@/lib/types/locationCluster"

// ─── Cluster cache ──────────────────────────────────────────────────────────
// location_clusters is a small, rarely-changing reference table. Caching
// avoids a DB round-trip per property per lead once this is wired into
// per-lead match scoring.

let clusterCache: LocationCluster[] | null = null
let clusterCacheLoadedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

async function loadClusters(): Promise<LocationCluster[]> {
  const isFresh = clusterCache && Date.now() - clusterCacheLoadedAt < CACHE_TTL_MS
  if (isFresh) return clusterCache!

  const { data, error } = await supabase.from("location_clusters").select("*")

  if (error) {
    console.error("[locationIntelligence] Failed to load location_clusters:", error)
    return clusterCache ?? []
  }

  clusterCache = (data as LocationCluster[]) ?? []
  clusterCacheLoadedAt = Date.now()
  return clusterCache
}

// Exposed for tests / admin tooling that seed or edit clusters at runtime.
export function clearLocationClusterCache() {
  clusterCache = null
  clusterCacheLoadedAt = 0
}

// ─── Normalization helpers ──────────────────────────────────────────────────

function normalizeZip(zip: string | null | undefined): string {
  return (zip || "").replace(/\D/g, "").slice(0, 5)
}

function normalizeText(s: string | null | undefined): string {
  return (s || "").toLowerCase().trim()
}

function extractZipFromAddress(address: string | null | undefined): string {
  const match = (address || "").match(/\b(\d{5})\b/)
  return match ? match[1] : ""
}

function dedupeClusters(clusters: LocationCluster[]): LocationCluster[] {
  const seen = new Set<string>()
  return clusters.filter((c) => {
    if (seen.has(c.cluster_id)) return false
    seen.add(c.cluster_id)
    return true
  })
}

// A cluster's display name may contain multiple aliases separated by " / "
// (e.g. "La Cantera / The Rim"). Treat each half as its own matchable term.
function clusterNameParts(clusterName: string): string[] {
  return clusterName.split("/").map((part) => normalizeText(part)).filter(Boolean)
}

// Strips spaces/punctuation so "Riverwalk" and "River Walk" compare equal,
// and shorthand like "Six Flags" can be checked against a longer landmark
// name like "Six Flags Fiesta Texas" regardless of which side is longer.
function squash(s: string): string {
  return normalizeText(s).replace(/[^a-z0-9]/g, "")
}

const MIN_SQUASH_MATCH_LENGTH = 3 // avoids trivial/noisy matches like "a" or "rd"

function matchesKeywordList(haystack: string, keywords: string[]): boolean {
  if (!haystack) return false
  const haystackSquashed = squash(haystack)
  if (haystackSquashed.length < MIN_SQUASH_MATCH_LENGTH) return false

  return keywords.some((kw) => {
    const needleSquashed = squash(kw)
    if (needleSquashed.length < MIN_SQUASH_MATCH_LENGTH) return false

    // Bidirectional partial-contains: covers both shorthand input matching
    // a longer landmark ("Six Flags" → "Six Flags Fiesta Texas") and a
    // longer property name containing a shorter keyword/alias.
    return (
      haystackSquashed.includes(needleSquashed) ||
      needleSquashed.includes(haystackSquashed)
    )
  })
}

// property_keywords + landmarks + corridor_keywords are all "name/destination"
// style terms — matched the same way, just sourced from different
// admin-managed lists (plain keywords, POIs/destinations, and road/highway
// corridor search-intent terms, respectively).
function nameLandmarkTerms(c: LocationCluster): string[] {
  return [...c.property_keywords, ...(c.landmarks || []), ...(c.corridor_keywords || [])]
}

// ─── 1. getClusterByZip ─────────────────────────────────────────────────────

export async function getClusterByZip(zipCode: string): Promise<LocationCluster[]> {
  const zip = normalizeZip(zipCode)
  if (!zip) return []

  const clusters = await loadClusters()

  return clusters.filter(
    (c) => c.core_zips.includes(zip) || c.nearby_zips.includes(zip)
  )
}

// ─── 2. getClusterByPropertyName ────────────────────────────────────────────
// Checks keywords/landmarks, aliases, and the cluster's own display name —
// any of these matching the property name counts as a name-level match.

export async function getClusterByPropertyName(propertyName: string): Promise<LocationCluster[]> {
  const name = normalizeText(propertyName)
  if (!name) return []

  const clusters = await loadClusters()

  return clusters.filter(
    (c) =>
      matchesKeywordList(name, nameLandmarkTerms(c)) ||
      matchesKeywordList(name, c.aliases || []) ||
      clusterNameParts(c.cluster_name).some((part) => name.includes(part))
  )
}

// ─── 3. getClusterByNeighborhood ────────────────────────────────────────────

export async function getClusterByNeighborhood(neighborhood: string): Promise<LocationCluster[]> {
  const text = normalizeText(neighborhood)
  if (!text) return []

  const clusters = await loadClusters()

  return clusters.filter(
    (c) =>
      matchesKeywordList(text, c.aliases || []) ||
      matchesKeywordList(text, nameLandmarkTerms(c)) ||
      clusterNameParts(c.cluster_name).some((part) => text.includes(part))
  )
}

// ─── 4. getPropertyLocationSignals ──────────────────────────────────────────
//
// Priority order (highest → lowest):
//   1. Property Name Match   (property_keywords + landmarks + cluster name, vs. property name)
//   2. Alias Match           (aliases, vs. property name OR neighborhood text)
//   3. Neighborhood Match    (property_keywords + landmarks + cluster name, vs. neighborhood text)
//   4. Core ZIP Match
//   5. Nearby ZIP Match
//
// `matchedClusters` / `primaryCluster` reflect ONLY the highest-priority
// tier that produced a result — a nearby-ZIP overlap can never appear in
// `matchedClusters` if a stronger signal (name, alias, neighborhood, or
// core ZIP) already resolved the property. The raw `zipMatches` /
// `keywordMatches` / `neighborhoodMatches` arrays remain unfiltered for
// debugging/inspection.

export type PropertyLocationSignals = {
  matchedClusters: LocationCluster[]
  primaryCluster: LocationCluster | null
  resolvedBy: "name" | "alias" | "neighborhood" | "core_zip" | "nearby_zip" | "none"

  zipMatches: LocationCluster[]
  zipCoreMatches: LocationCluster[]
  zipNearbyMatches: LocationCluster[]
  keywordMatches: LocationCluster[]
  neighborhoodMatches: LocationCluster[]
  aliasMatches: LocationCluster[]

  confidenceScore: number // 0-100
}

export async function getPropertyLocationSignals(property: any): Promise<PropertyLocationSignals> {
  const zip = normalizeZip(
    property?.zip || property?.zip_code || extractZipFromAddress(property?.full_address)
  )
  const name = normalizeText(property?.name)
  const neighborhoodText = normalizeText(
    [property?.neighborhood, property?.submarket].filter(Boolean).join(" ")
  )

  const clusters = await loadClusters()

  // ─ Tier 1: Property Name Match ─
  const nameKeywordMatches = clusters.filter(
    (c) =>
      matchesKeywordList(name, nameLandmarkTerms(c)) ||
      clusterNameParts(c.cluster_name).some((part) => name.includes(part))
  )

  // ─ Tier 2: Alias Match (name first, then neighborhood text) ─
  const nameAliasMatches = clusters.filter((c) => matchesKeywordList(name, c.aliases || []))
  const neighborhoodAliasMatches = clusters.filter((c) =>
    matchesKeywordList(neighborhoodText, c.aliases || [])
  )
  const aliasMatches = dedupeClusters([...nameAliasMatches, ...neighborhoodAliasMatches])

  // ─ Tier 3: Neighborhood / Submarket Match ─
  const neighborhoodMatches = clusters.filter(
    (c) =>
      matchesKeywordList(neighborhoodText, nameLandmarkTerms(c)) ||
      clusterNameParts(c.cluster_name).some((part) => neighborhoodText.includes(part))
  )

  // ─ Tier 4 / 5: ZIP ─
  const zipCoreMatches = zip ? clusters.filter((c) => c.core_zips.includes(zip)) : []
  const zipNearbyMatches = zip ? clusters.filter((c) => c.nearby_zips.includes(zip)) : []
  const zipMatches = dedupeClusters([...zipCoreMatches, ...zipNearbyMatches])

  // Backward-compatible "keywordMatches" = name-level keyword/landmark hits
  // (kept separate from aliasMatches per the requested return shape).
  const keywordMatches = nameKeywordMatches

  // ─ Priority resolution: first non-empty tier wins ─
  const tiers: { clusters: LocationCluster[]; resolvedBy: PropertyLocationSignals["resolvedBy"] }[] = [
    { clusters: nameKeywordMatches, resolvedBy: "name" },
    { clusters: aliasMatches, resolvedBy: "alias" },
    { clusters: neighborhoodMatches, resolvedBy: "neighborhood" },
    { clusters: zipCoreMatches, resolvedBy: "core_zip" },
    { clusters: zipNearbyMatches, resolvedBy: "nearby_zip" },
  ]

  const winningTier = tiers.find((t) => t.clusters.length > 0)
  const matchedClusters = winningTier ? dedupeClusters(winningTier.clusters) : []
  const primaryCluster = matchedClusters[0] ?? null
  const resolvedBy = winningTier ? winningTier.resolvedBy : "none"

  // ─ Confidence scoring, based on the resolving tier ─
  const TIER_CONFIDENCE: Record<PropertyLocationSignals["resolvedBy"], number> = {
    name: 95,
    alias: 85,
    neighborhood: 65,
    core_zip: 50,
    nearby_zip: 25,
    none: 0,
  }

  let confidenceScore = TIER_CONFIDENCE[resolvedBy]

  // Small bonus if another independent tier also points to the same
  // primary cluster (corroboration), capped at 100.
  if (primaryCluster) {
    const corroboratingTiers = tiers.filter(
      (t) => t.resolvedBy !== resolvedBy && t.clusters.some((c) => c.cluster_id === primaryCluster.cluster_id)
    ).length
    confidenceScore = Math.min(100, confidenceScore + corroboratingTiers * 5)
  }

  return {
    matchedClusters,
    primaryCluster,
    resolvedBy,
    zipMatches,
    zipCoreMatches,
    zipNearbyMatches,
    keywordMatches,
    neighborhoodMatches,
    aliasMatches,
    confidenceScore,
  }
}

// ─── 5. resolveLeadLocationClusters ─────────────────────────────────────────
// Resolves a lead's location intent from whichever fields are populated.
// city/notes are reliably populated by the current CRM Add Lead form;
// neighborhoods/desired_areas may be populated via other lead-creation
// paths (e.g. public site forms), so they're checked defensively too.

export async function resolveLeadLocationClusters(lead: any): Promise<LocationCluster[]> {
  const text = [lead?.city, lead?.neighborhoods, lead?.desired_areas, lead?.notes]
    .filter(Boolean)
    .join(" ")

  return getClusterByNeighborhood(text)
}

// ─── 6. scoreLocationMatch ───────────────────────────────────────────────────
// Pure, synchronous scoring helper — takes already-resolved cluster arrays
// (no DB access here) and returns a single location-match score. Supports
// multiple matched clusters on either side, for ambiguous destinations like
// "Lackland" or "Camp Bullis" that map to more than one cluster.
//
// allowNearbyScoring: when the lead's exact cluster already has plenty of
// candidate properties (>= 6, decided by the caller), nearby-cluster credit
// is disabled so weaker, merely-adjacent properties don't get boosted
// alongside a lead who has no shortage of exact-cluster options. Defaults
// to true (current/original behavior) when the caller doesn't pass it.

export function scoreLocationMatch(
  leadClusters: LocationCluster[],
  propertyClusters: LocationCluster[],
  sameClusterPoints = 30,
  nearbyClusterPoints = 20,
  allowNearbyScoring = true
): number {
  const leadIds = new Set(leadClusters.map((c) => c.cluster_id))
  const propertyIds = new Set(propertyClusters.map((c) => c.cluster_id))

  // Same cluster: any direct id overlap between lead and property clusters.
  for (const id of propertyIds) {
    if (leadIds.has(id)) return sameClusterPoints
  }

  if (!allowNearbyScoring) return 0

  // Nearby cluster: any property cluster's nearby_clusters includes a lead
  // cluster, or vice versa (checked both directions — nearby_clusters isn't
  // guaranteed to be perfectly symmetric across every cluster pair).
  const isNearby =
    propertyClusters.some((pc) => pc.nearby_clusters.some((nc) => leadIds.has(nc))) ||
    leadClusters.some((lc) => lc.nearby_clusters.some((nc) => propertyIds.has(nc)))

  if (isNearby) return nearbyClusterPoints

  return 0
}

// ─── 7. countExactClusterMatches ────────────────────────────────────────────
// Counts how many candidate properties resolve to the SAME cluster as the
// lead (exact match only, no nearby credit) — used by the caller to decide
// whether nearby-cluster scoring should be disabled for this lead's batch
// (see allowNearbyScoring above).

export function countExactClusterMatches(
  leadClusters: LocationCluster[],
  candidatePropertyClusters: LocationCluster[][]
): number {
  const leadIds = new Set(leadClusters.map((c) => c.cluster_id))

  return candidatePropertyClusters.filter((propertyClusters) =>
    propertyClusters.some((c) => leadIds.has(c.cluster_id))
  ).length
}

// ─── 8. matchesStrict ────────────────────────────────────────────────────────
// One-directional version of matchesKeywordList: the haystack must CONTAIN
// the keyword — never the reverse. This is the fix for the "West"/"Loop
// 1604 West" bug: matchesKeywordList's bidirectional check let a short,
// generic haystack (e.g. neighborhood = "West") match merely because a
// longer cluster term happened to contain it as a substring ("Westin",
// "Loop 1604 West" both contain "west"). That reverse direction is only
// ever appropriate for landmark shorthand ("Six Flags" → "Six Flags Fiesta
// Texas") — so primary-cluster resolution uses matchesStrict everywhere
// EXCEPT the landmark tier, which still uses the original bidirectional
// matchesKeywordList.

function matchesStrict(haystack: string, keywords: string[]): boolean {
  if (!haystack) return false
  const haystackSquashed = squash(haystack)
  if (haystackSquashed.length < MIN_SQUASH_MATCH_LENGTH) return false

  return keywords.some((kw) => {
    const needleSquashed = squash(kw)
    if (needleSquashed.length < MIN_SQUASH_MATCH_LENGTH) return false
    return haystackSquashed.includes(needleSquashed)
  })
}

// ─── 9. resolveLeadPrimaryCluster ───────────────────────────────────────────
// Single-winner lead location resolution — replaces the old multi-cluster,
// no-priority resolveLeadLocationClusters for candidate-filtering purposes.
// (resolveLeadLocationClusters remains available, unchanged, for any other
// existing consumer.)
//
// Priority: lead.neighborhoods field FIRST and ALONE, checked only against
// aliases + cluster-name parts (no keyword/landmark/corridor pool — keeps
// this resolution tight and specific). Only if that field is empty or
// matches nothing do we fall back to city/notes/desired_areas text, same
// strict matching. Corridor keywords are never consulted (per decision:
// fully inert for now).

export type LeadPrimaryLocation = {
  primaryCluster: LocationCluster | null
  resolvedBy: "neighborhood_field" | "notes_or_city" | "none"
  confidenceScore: number
}

function findPrimaryByAliasOrName(text: string, clusters: LocationCluster[]): LocationCluster | null {
  if (!text) return null
  return (
    clusters.find(
      (c) =>
        matchesStrict(text, c.aliases || []) ||
        clusterNameParts(c.cluster_name).some((part) => text.includes(part))
    ) ?? null
  )
}

export async function resolveLeadPrimaryCluster(lead: any): Promise<LeadPrimaryLocation> {
  const clusters = await loadClusters()

  const neighborhoodText = normalizeText(lead?.neighborhoods)
  const neighborhoodMatch = findPrimaryByAliasOrName(neighborhoodText, clusters)
  if (neighborhoodMatch) {
    return { primaryCluster: neighborhoodMatch, resolvedBy: "neighborhood_field", confidenceScore: 90 }
  }

  const fallbackText = normalizeText(
    [lead?.city, lead?.notes, lead?.desired_areas].filter(Boolean).join(" ")
  )
  const fallbackMatch = findPrimaryByAliasOrName(fallbackText, clusters)
  if (fallbackMatch) {
    return { primaryCluster: fallbackMatch, resolvedBy: "notes_or_city", confidenceScore: 60 }
  }

  return { primaryCluster: null, resolvedBy: "none", confidenceScore: 0 }
}

// ─── 10. resolvePropertyPrimaryCluster ──────────────────────────────────────
// Single-winner property location resolution — replaces using
// getPropertyLocationSignals.matchedClusters/primaryCluster for
// candidate-filtering purposes. (getPropertyLocationSignals remains
// available, unchanged, for any other existing/debug consumer.)
//
// Priority order (first non-empty tier wins):
//   1. Property name match        — strict, vs. property_keywords + aliases + cluster name
//   2. Neighborhood/submarket     — strict, same term set, vs. neighborhood/submarket text
//   3. Core ZIP match             — core_zips only, NEVER nearby_zips
//   4. Landmark match             — the ONLY tier allowed bidirectional
//                                    shorthand matching (matchesKeywordList), vs. landmarks only
//   5. None
//
// Explicitly excluded from every tier: corridor_keywords (fully inert per
// decision), nearby_zips, and any non-winning/secondary signal — there is
// no OR-across-arrays here, just a strict first-match-wins walk.

export type PropertyPrimaryLocation = {
  primaryCluster: LocationCluster | null
  resolvedBy: "name" | "neighborhood" | "core_zip" | "landmark" | "none"
  confidenceScore: number
}

export async function resolvePropertyPrimaryCluster(property: any): Promise<PropertyPrimaryLocation> {
  const clusters = await loadClusters()

  const zip = normalizeZip(
    property?.zip || property?.zip_code || property?.postal_code || extractZipFromAddress(property?.full_address)
  )
  const name = normalizeText(property?.name)
  const neighborhoodText = normalizeText(
    [property?.neighborhood, property?.submarket].filter(Boolean).join(" ")
  )

  const strictTerms = (c: LocationCluster) => c.property_keywords // landmarks + corridor_keywords excluded here on purpose

  // Tier 1: name
  const nameMatch = clusters.find(
    (c) =>
      matchesStrict(name, strictTerms(c)) ||
      matchesStrict(name, c.aliases || []) ||
      clusterNameParts(c.cluster_name).some((part) => name.includes(part))
  )
  if (nameMatch) return { primaryCluster: nameMatch, resolvedBy: "name", confidenceScore: 95 }

  // Tier 2: neighborhood / submarket
  const neighborhoodMatch = clusters.find(
    (c) =>
      matchesStrict(neighborhoodText, strictTerms(c)) ||
      matchesStrict(neighborhoodText, c.aliases || []) ||
      clusterNameParts(c.cluster_name).some((part) => neighborhoodText.includes(part))
  )
  if (neighborhoodMatch) return { primaryCluster: neighborhoodMatch, resolvedBy: "neighborhood", confidenceScore: 80 }

  // Tier 3: core ZIP only
  if (zip) {
    const zipMatch = clusters.find((c) => c.core_zips.includes(zip))
    if (zipMatch) return { primaryCluster: zipMatch, resolvedBy: "core_zip", confidenceScore: 60 }
  }

  // Tier 4: landmark (bidirectional shorthand matching allowed ONLY here)
  const landmarkMatch = clusters.find(
    (c) =>
      matchesKeywordList(name, c.landmarks || []) ||
      matchesKeywordList(neighborhoodText, c.landmarks || [])
  )
  if (landmarkMatch) return { primaryCluster: landmarkMatch, resolvedBy: "landmark", confidenceScore: 50 }

  return { primaryCluster: null, resolvedBy: "none", confidenceScore: 0 }
}

// ─── 11. selectLocationCandidates ───────────────────────────────────────────
// Candidate-pool FILTER, applied BEFORE scoring (not a scoring bonus).
// Operates on single resolved primary clusters (LeadPrimaryLocation /
// PropertyPrimaryLocation) — a direct cluster-ID equality check, not an
// OR across multiple independently-computed signal arrays. This is what
// guarantees a secondary/non-winning signal can never substitute for the
// primary cluster.
//
// Tiers, in order:
//   1. Exact match — property.primaryCluster.cluster_id === lead.primaryCluster.cluster_id.
//      If this pool has >= minCandidates properties, use it as-is. No
//      nearby clusters, no citywide properties.
//   2. Nearby-cluster expansion — only if Tier 1 is too small. Accept-set
//      becomes the lead's primary cluster + its nearby_clusters.
//   3. Citywide fallback — only if Tier 2 is still too small. Falls back
//      to the full, unfiltered candidate list.
//
// Corridor keywords play no role at any tier (fully inert per decision).

export type LocationCandidateDebugEntry = {
  propertyName: string
  included: boolean
  reason: string
  matchedVia: string
}

export type LocationCandidateResult = {
  candidates: any[]
  candidatePrimaryLocations: PropertyPrimaryLocation[]
  exactMatchCount: number
  nearbyExpandedCount: number
  usedNearbyExpansion: boolean
  usedCitywideFallback: boolean
  acceptedClusterIds: string[]
  debugEntries: LocationCandidateDebugEntry[]
}

export function selectLocationCandidates(
  properties: any[],
  propertyPrimaryLocations: PropertyPrimaryLocation[],
  leadPrimary: LeadPrimaryLocation,
  minCandidates = 6
): LocationCandidateResult {
  // No resolved lead primary cluster at all — nothing meaningful to filter on.
  if (!leadPrimary.primaryCluster) {
    return {
      candidates: properties,
      candidatePrimaryLocations: propertyPrimaryLocations,
      exactMatchCount: 0,
      nearbyExpandedCount: 0,
      usedNearbyExpansion: false,
      usedCitywideFallback: true,
      acceptedClusterIds: [],
      debugEntries: properties.map((p, i) => ({
        propertyName: p.name,
        included: true,
        reason: "no_lead_primary_cluster_citywide_fallback",
        matchedVia: propertyPrimaryLocations[i].resolvedBy,
      })),
    }
  }

  const leadClusterId = leadPrimary.primaryCluster.cluster_id

  // ─ Tier 1: exact primary-cluster match ─
  const exactIncluded = propertyPrimaryLocations.map(
    (loc) => loc.primaryCluster?.cluster_id === leadClusterId
  )
  const exactMatchCount = exactIncluded.filter(Boolean).length

  if (exactMatchCount >= minCandidates) {
    return {
      candidates: properties.filter((_, i) => exactIncluded[i]),
      candidatePrimaryLocations: propertyPrimaryLocations.filter((_, i) => exactIncluded[i]),
      exactMatchCount,
      nearbyExpandedCount: exactMatchCount,
      usedNearbyExpansion: false,
      usedCitywideFallback: false,
      acceptedClusterIds: [leadClusterId],
      debugEntries: properties.map((p, i) => ({
        propertyName: p.name,
        included: exactIncluded[i],
        reason: exactIncluded[i] ? "exact_primary_cluster_match" : "excluded_different_or_no_primary_cluster",
        matchedVia: propertyPrimaryLocations[i].resolvedBy,
      })),
    }
  }

  // ─ Tier 2: nearby-cluster expansion ─
  const expandedIds = new Set([leadClusterId, ...leadPrimary.primaryCluster.nearby_clusters])
  const expandedIncluded = propertyPrimaryLocations.map(
    (loc) => !!loc.primaryCluster && expandedIds.has(loc.primaryCluster.cluster_id)
  )
  const nearbyExpandedCount = expandedIncluded.filter(Boolean).length

  if (nearbyExpandedCount >= minCandidates) {
    return {
      candidates: properties.filter((_, i) => expandedIncluded[i]),
      candidatePrimaryLocations: propertyPrimaryLocations.filter((_, i) => expandedIncluded[i]),
      exactMatchCount,
      nearbyExpandedCount,
      usedNearbyExpansion: true,
      usedCitywideFallback: false,
      acceptedClusterIds: [...expandedIds],
      debugEntries: properties.map((p, i) => ({
        propertyName: p.name,
        included: expandedIncluded[i],
        reason: expandedIncluded[i]
          ? exactIncluded[i] ? "exact_primary_cluster_match" : "nearby_primary_cluster_match"
          : "excluded_no_match_even_after_nearby_expansion",
        matchedVia: propertyPrimaryLocations[i].resolvedBy,
      })),
    }
  }

  // ─ Tier 3: citywide fallback — still short even after nearby expansion ─
  return {
    candidates: properties,
    candidatePrimaryLocations: propertyPrimaryLocations,
    exactMatchCount,
    nearbyExpandedCount,
    usedNearbyExpansion: true,
    usedCitywideFallback: true,
    acceptedClusterIds: [...expandedIds],
    debugEntries: properties.map((p, i) => ({
      propertyName: p.name,
      included: true,
      reason: "citywide_fallback_insufficient_primary_cluster_candidates",
      matchedVia: propertyPrimaryLocations[i].resolvedBy,
    })),
  }
}

// ─── 9. explainPropertyClusterMatch ─────────────────────────────────────────
// DEBUG ONLY — re-derives, term by term, EXACTLY which cluster field
// (alias, property_keyword, landmark, corridor_keyword, zip, or cluster
// name) caused a property to match a given cluster, and which property
// field (name vs. neighborhood/submarket vs. zip) it matched against.
// Does not change matching behavior — read-only re-derivation using the
// same squash()/matchesKeywordList() logic getPropertyLocationSignals
// already uses internally, just exposing the specific term instead of a
// boolean.

export type ClusterMatchExplanation = {
  clusterId: string
  clusterName: string
  signal: "name" | "alias" | "neighborhood" | "zip_core" | "zip_nearby" | "landmark_or_keyword"
  matchedField: "property_name" | "neighborhood_submarket" | "zip"
  matchedValue: string // the exact cluster-side term/zip that caused the match
}

export function explainPropertyClusterMatch(
  property: any,
  cluster: LocationCluster
): ClusterMatchExplanation[] {
  const explanations: ClusterMatchExplanation[] = []

  const zip = normalizeZip(
    property?.zip || property?.zip_code || property?.postal_code || extractZipFromAddress(property?.full_address)
  )
  const name = normalizeText(property?.name)
  const neighborhoodText = normalizeText(
    [property?.neighborhood, property?.submarket].filter(Boolean).join(" ")
  )

  const push = (
    signal: ClusterMatchExplanation["signal"],
    matchedField: ClusterMatchExplanation["matchedField"],
    matchedValue: string
  ) => {
    explanations.push({ clusterId: cluster.cluster_id, clusterName: cluster.cluster_name, signal, matchedField, matchedValue })
  }

  if (zip && cluster.core_zips.includes(zip)) push("zip_core", "zip", zip)
  if (zip && cluster.nearby_zips.includes(zip)) push("zip_nearby", "zip", zip)

  for (const term of nameLandmarkTerms(cluster)) {
    if (matchesKeywordList(name, [term])) push("landmark_or_keyword", "property_name", term)
    if (matchesKeywordList(neighborhoodText, [term])) push("landmark_or_keyword", "neighborhood_submarket", term)
  }

  for (const alias of cluster.aliases || []) {
    if (matchesKeywordList(name, [alias])) push("alias", "property_name", alias)
    if (matchesKeywordList(neighborhoodText, [alias])) push("alias", "neighborhood_submarket", alias)
  }

  for (const part of clusterNameParts(cluster.cluster_name)) {
    if (name.includes(part)) push("name", "property_name", part)
    if (neighborhoodText.includes(part)) push("neighborhood", "neighborhood_submarket", part)
  }

  return explanations
}
