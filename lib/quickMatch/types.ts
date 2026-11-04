// Quick Match — the shapes the engine reasons over.
//
// Deliberately plain data. Nothing here touches Supabase, React or the network, so the whole
// engine is testable from fixtures and a screening rule can be proved without a database.
import type {
  ApprovalStatus, BalanceRequirement, CriminalPolicy, LookbackBasis, OffenseType,
} from "@/lib/propertyIntel/approvalCriteria"

/** The vocabularies are the EDITOR'S OWN, imported rather than restated. One list means a token
 *  the owner can type is a token the engine understands, and a new one cannot reach production
 *  understood by only half the system. */
export type PolicyStatus = ApprovalStatus
export type { BalanceRequirement, CriminalPolicy, LookbackBasis, OffenseType }

/**
 * The confidence tiers, strongest first.
 *
 *   strong_candidate   every requirement that applies to this client is stated, and met.
 *   needs_verification there is evidence, and an open question with it.
 *   curated_only       a curated member with NOTHING on record about this client's situation.
 *   known_mismatch     a stated requirement this client cannot meet. EXCLUDED from the list.
 *
 * `curated_only` is the one tier that rests on human curation rather than on data, and it is
 * separated from needs_verification for exactly that reason — see the note in ranking.ts.
 */
export type ScreeningTier = "strong_candidate" | "needs_verification" | "curated_only" | "known_mismatch"

/** Tiers that may be recommended, in order. known_mismatch is never one of them. */
export const RECOMMENDABLE_TIERS = ["strong_candidate", "needs_verification", "curated_only"] as const
export type RecommendableTier = (typeof RECOMMENDABLE_TIERS)[number]

/** A property has to EARN a place. `off_collection` is refused before anything is assessed. */
export type ScreeningOutcome = ScreeningTier | "off_collection"

export type QuickMatchProperty = {
  placeId: string
  propertyName: string | null
  address: string | null
  zip: string | null
  websiteUrl: string | null
  imageUrl: string | null
  googleRating: number | null
  currentSpecial: string | null
  /** Curated membership. A property whose value is null is NOT a Quick Match member. */
  quickMatchCollection: string | null

  // ── Credit ──────────────────────────────────────────────────────────────────
  creditMinimumStatus: string | null
  creditMinimumScore: number | null
  /** A historical approval. NEVER a minimum — see the policy note in screening.ts. */
  creditObservedApprovalScore: number | null
  /** Agent-reported free text. Can only ever raise a question, never settle one. */
  creditScreeningNotes: string | null

  // ── Broken lease ────────────────────────────────────────────────────────────
  brokenLeaseStatus: PolicyStatus | null
  brokenLeaseMinAgeYears: number | null
  brokenLeaseBalanceRequirement: BalanceRequirement | null
  brokenLeaseMaxBalance: number | null
  brokenLeasePositiveHistoryRequired: boolean | null

  // ── Eviction ────────────────────────────────────────────────────────────────
  evictionStatus: PolicyStatus | null
  evictionMinAgeYears: number | null
  evictionBalanceRequirement: BalanceRequirement | null
  evictionPositiveHistoryRequired: boolean | null

  // ── Rental debt / collections ───────────────────────────────────────────────
  rentalDebtStatus: PolicyStatus | null
  rentalDebtBalanceRequirement: BalanceRequirement | null
  rentalDebtMaxBalance: number | null

  // ── Criminal background ─────────────────────────────────────────────────────
  felonyPolicy: CriminalPolicy | null
  felonyMinAgeYears: number | null
  felonyRestrictions: string | null
  misdemeanorPolicy: CriminalPolicy | null
  misdemeanorMinAgeYears: number | null
  misdemeanorRestrictions: string | null
  /** The categories the property RESTRICTS. null = none recorded, NEVER "all accepted". */
  criminalRestrictedOffenseTypes: OffenseType[] | null
  /** What the minimum age counts from. null = the office did not say, which is not a default. */
  criminalLookbackBasis: LookbackBasis | null
  backgroundScreeningNotes: string | null

  // ── Approval costs and provenance ───────────────────────────────────────────
  screeningAdditionalDeposit: string | null
  screeningRiskFee: string | null
  screeningGuarantorProgram: string | null
  screeningRequirementsCheckedAt: string | null

  // ── Housing fit ─────────────────────────────────────────────────────────────
  bedsMin: number | null
  bedsMax: number | null
  onebrStartingRent: number | null
  twobrStartingRent: number | null
  threebrStartingRent: number | null
  /** The community's overall floor. NEVER used to claim a given floor plan fits a budget. */
  rentMin: number | null
  latitude: number | null
  longitude: number | null
}

/** One finding behind a tier, shown to the agent verbatim. */
export type Finding = {
  /** Which requirement produced it — the property_catalog column name where there is one. */
  field: string
  verdict: "meets" | "fails" | "unknown"
  /** Agent-facing sentence. */
  text: string
  /** True when it came from free-text notes rather than a structured column. */
  fromNotes?: boolean
}

export type ScreeningAssessment = {
  outcome: ScreeningOutcome
  /** Everything that was checked, for the card's "why" and "needs verification" sections. */
  findings: Finding[]
  /** Conditions the agent must confirm before relying on this property. */
  unverified: string[]
  /** Documented restrictions that CONFLICT with what this client has on record. */
  conflicts: string[]
  /** Costs attached to approval: deposits, risk fees, guarantor programmes. */
  conditions: string[]
}
