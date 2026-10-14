// VERIFIED PROPERTY DETAILS — the shape of reusable, per-property research.
//
// One record per (owner_user_id, place_id), read by EVERY video of that community. The split
// below is the whole design: a building's ceiling heights do not expire, a concession does, and
// forcing one verification date onto both is how a nine-month-old "8 weeks free" ends up on a Reel
// presented as current.
//
// NOTHING HERE FEEDS MARKETING AUTOMATICALLY. The overlay, caption and template read the post's
// own fields. This record is what a human consults; promoting a fact out of it into marketing is
// always a deliberate act, which is why `status` travels with every time-sensitive claim.

/** How much a time-sensitive claim can currently be relied on. Never inferred — always recorded. */
export const CLAIM_STATUSES = ["verified_current", "previously_recorded", "expired", "conflicting", "unknown"] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

/** Where a fact came from. "The leasing page says so" and "an aggregator says so" are different
 *  claims, and the UI has to be able to show which one a fact rests on. */
export type SourceKind = "official" | "third_party"

export type ResearchSource = {
  url: string
  kind: SourceKind
  /** ISO date the claim was checked. */
  verifiedAt: string
  /** Which parts of the record this source supports, e.g. ["amenities", "floorPlans"]. */
  covers?: string[]
}

/** One published floor plan. Qualifications travel WITH the value — "16 ft ceilings*" is not the
 *  same claim as "16 ft ceilings", and flattening the asterisk loses the only honest part. */
export type FloorPlan = {
  model: string
  beds?: string | null
  baths?: string | null
  sqft?: string | null
  /** Advertised range as published, verbatim. Never normalised into a single number. */
  rent?: string | null
  /** base | advertised | effective_after_concessions — which price this actually is. */
  rentBasis?: "base" | "advertised" | "effective" | "unknown" | null
  availableUnits?: number | null
  availableFrom?: string | null
  /** Plan-specific features: private yard, attached garage, two-storey, W/D included. */
  features?: string[]
  qualification?: string | null
}

/** Facts that do not expire. */
export type StableResearch = {
  address?: string | null
  city?: string | null
  neighborhood?: string | null
  /** The property's own site, when one was found. Absent is a real answer. */
  officialWebsite?: string | null
  yearBuilt?: string | null
  stories?: number | null
  unitCount?: number | null
  /** Original architectural subtype, preserved when the property TYPE was normalised —
   *  "Split-Level Loft" becomes the type "Loft" and stays here verbatim. */
  architecturalSubtype?: string | null
  architecture?: string[]
  /** Verbatim, with qualifications: "16 ft vaulted (select plans)". */
  ceilingHeights?: string[]
  layouts?: string[]
  interiorFeatures?: string[]
  communityAmenities?: string[]
  laundry?: string | null
  parking?: string | null
  floorPlans?: FloorPlan[]
}

/** One price or concession, with the status and date that make it usable — or not. */
export type TimedClaim = {
  value: string
  status: ClaimStatus
  verifiedAt: string
  expiresAt?: string | null
  /** Which plans or units it applies to. "select units" is a material qualification. */
  appliesTo?: string | null
  leaseTerms?: string | null
  sourceUrl?: string | null
  sourceKind?: SourceKind | null
  note?: string | null
}

export type PricingResearch = {
  /** Lowest verifiable advertised start per bedroom category. Absent = unknown, never guessed. */
  startingPrices?: Partial<Record<"studio" | "oneBed" | "twoBed" | "threeBed" | "fourBed", TimedClaim>>
  specials?: TimedClaim[]
  availabilityNote?: TimedClaim | null
}

/** A contradiction or an open question, kept as data so an update cannot quietly lose it. */
export type Unresolved = {
  field: string
  issue: string
  /** What each source said, when they disagree. */
  conflicting?: string[]
  raisedAt: string
}

export type PropertyResearchRecord = {
  placeId: string
  propertyName?: string | null
  stable: StableResearch
  pricing: PricingResearch
  sources: ResearchSource[]
  unresolved: Unresolved[]
}

/** Is this status safe to put in front of a renter today? Only one is. */
export function isMarketable(status: ClaimStatus): boolean {
  return status === "verified_current"
}

/**
 * Which time-sensitive claims in a record must NOT drive an overlay, caption or template.
 *
 * Returns the unusable ones rather than a boolean, so a reviewer sees exactly what would have been
 * asserted and on what basis — "6 Weeks Free (previously_recorded, 2026-10-14)" is actionable;
 * "unsafe" is not.
 */
export function unverifiedClaims(record: PropertyResearchRecord): { label: string; claim: TimedClaim }[] {
  const out: { label: string; claim: TimedClaim }[] = []
  for (const [k, c] of Object.entries(record.pricing.startingPrices ?? {})) {
    if (c && !isMarketable(c.status)) out.push({ label: `starting price · ${k}`, claim: c })
  }
  for (const s of record.pricing.specials ?? []) {
    if (!isMarketable(s.status)) out.push({ label: "special", claim: s })
  }
  return out
}

/**
 * Can this content row reuse a research record?
 *
 * A MISSING place_id matches nothing. That is the rule that stops two unidentified properties
 * being merged into one record because both happened to have no id — the failure mode that would
 * put one building's ceiling heights on another building's video.
 */
export function researchKeyFor(
  content: { owner_user_id?: string | null; place_id?: string | null } | null | undefined,
): { ownerUserId: string; placeId: string } | null {
  const owner = (content?.owner_user_id ?? "").trim()
  const place = (content?.place_id ?? "").trim()
  if (!owner || !place) return null
  return { ownerUserId: owner, placeId: place }
}
