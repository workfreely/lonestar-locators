// Canonical lead classification — the ONE place that decides the two
// independent dimensions of a lead, so the submit route (and its tests) can
// never conflate them again:
//
//   • lead_type    = CLIENT TYPE  — 'renter' | 'buyer' | 'seller'
//   • form_variant = FORM SHAPE   — 'short' | 'full'
//
// Locator Beast intake is renter-only today, so a caller that sends no client
// type (or sends a legacy form-shape value like "full"/"short" in the old
// lead_type slot) is normalized to 'renter'. This guarantees the value can
// never violate the leads_lead_type_check constraint, regardless of what a
// form or an older client happens to post.

export const CLIENT_TYPES = ["renter", "buyer", "seller"] as const
export type ClientType = (typeof CLIENT_TYPES)[number]

export type FormVariant = "short" | "full"

export function isClientType(value: unknown): value is ClientType {
  return typeof value === "string" && (CLIENT_TYPES as readonly string[]).includes(value)
}

/**
 * Resolves the canonical { lead_type, form_variant } for a submission.
 *
 * @param formType     the SHAPE of the submitted form ('short' | 'full') —
 *                     already validated by the caller.
 * @param sentLeadType whatever arrived in the request's lead_type slot. A
 *                     canonical client type is kept; anything else (a legacy
 *                     form-shape value, undefined, garbage) becomes 'renter'.
 */
export function resolveLeadClassification(
  formType: FormVariant,
  sentLeadType?: string | null,
): { lead_type: ClientType; form_variant: FormVariant } {
  return {
    lead_type: isClientType(sentLeadType) ? sentLeadType : "renter",
    form_variant: formType,
  }
}

/**
 * Whether a lead's market should be inferred from its landing page. True only
 * for a SHORT-form lead with no city — a full form always collects the city
 * directly. Reads form_variant (the form shape), never lead_type: the shape
 * moved off lead_type in the canonical split, and this preserves the exact
 * behavior LeadCard/LeadPanel had when they keyed on lead_type === "short".
 */
export function shouldInferMarketFromLandingPage(lead: {
  form_variant?: string | null
  city?: string | null
}): boolean {
  return lead.form_variant === "short" && !lead.city
}
