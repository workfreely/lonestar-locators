// Property Search Agent — safe enrichment write foundation (types).
//
// Pure types shared by the writer, the policy layer, and both stores (Supabase +
// in-memory test). No I/O here.

export type SourceType =
  | "official_property_site"
  | "official_management_site"
  | "google_places"
  | "trusted_locator_source"
  | "trusted_brokerage_source"
  | "manual_verified"
  | "public_web"
  | "unknown"

export type VerificationStatus = "verified" | "inferred" | "unverified" | "unknown"

export type ImageSelectionState = "keep" | "change_requested" | "missing"

// A candidate field update proposed by an enrichment job.
export type FieldCandidate = {
  field: string
  value: unknown // string | number | string[] | null
  sourceType: SourceType
  sourceReference?: string | null // URL, Google Place ID, or internal source id — optional
  verificationStatus: VerificationStatus
  checkedAt?: string | null // ISO
}

export type EnrichmentInput = {
  placeId: string
  jobId: string
  fields: FieldCandidate[]
  dryRun?: boolean
}

// Outcome of one candidate field.
export type Outcome =
  | "written"
  | "skipped"
  | "rejected"
  | "would_write"
  | "would_skip"
  | "would_reject"

export type FieldResult = {
  field: string
  outcome: Outcome
  reason: string
  oldValue?: string | null
  newValue?: string | null
}

export type EnrichmentResult = {
  placeId: string
  jobId: string
  dryRun: boolean
  applied: boolean // false when a concurrency conflict blocked the patch
  results: FieldResult[]
}

// The minimal property view the writer reads.
export type PropertySnapshot = {
  placeId: string
  updatedAt: string | null // optimistic-concurrency token
  imageSelectionState: ImageSelectionState
  // Current column values (only the fields the writer may touch are needed).
  values: Record<string, unknown>
}

// Current provenance per field (from property_field_provenance).
export type FieldProvenance = {
  sourceType: SourceType
  verificationStatus: VerificationStatus
  value: string | null
}

// ── Structured attribute (EAV) candidates + results (property_attributes) ──
export type Applicability =
  | "property_wide"
  | "select_units"
  | "specific_floor_plans"
  | "penthouses"
  | "unknown"

export type AttributeCandidate = {
  attributeKey: string
  value?: "yes" | "no" | "unknown" | null // for tristate keys
  valueText?: string | null // for text keys (building_style, ceiling_height, color_scheme)
  floorplanSpecific?: boolean
  applicability?: Applicability | null // richer scope; when set, floorplanSpecific is derived from it
  sourceType: SourceType
  sourceReference?: string | null
  verificationStatus: VerificationStatus
  checkedAt?: string | null
}

export type AttributeInput = {
  placeId: string
  jobId: string
  attributes: AttributeCandidate[]
  dryRun?: boolean
}

export type AttributeResult = {
  placeId: string
  jobId: string
  dryRun: boolean
  applied: boolean
  results: { attributeKey: string; outcome: Outcome; reason: string }[]
}

// Current stored attribute (from property_attributes).
export type StoredAttribute = {
  value: string | null // yes|no|unknown for tristate keys
  valueText: string | null
  floorplanSpecific: boolean
  applicability: string | null
  sourceType: SourceType | null
  verificationStatus: VerificationStatus | null
  checkedAt: string | null
}

// One row appended to property_enrichment_events.
export type EnrichmentEvent = {
  jobId: string
  placeId: string
  fieldName: string
  action: "written" | "skipped" | "rejected"
  oldValue: string | null
  newValue: string | null
  sourceType: SourceType
  sourceReference: string | null
  verificationStatus: VerificationStatus
  reason: string | null
  checkedAt: string | null
}
