// Canonical lead classification. Locator Beast has ONE Smart Lead Form —
// question configuration does not create different "form types" — so a lead's
// only classification dimension is the CLIENT TYPE:
//
//   lead_type = 'renter' | 'buyer' | 'seller'   (default 'renter')
//
// lead_type describes the client, never the form. Renter is the only active
// intake today; buyer/seller are schema-valid for the future but have no
// workflow yet. This module never inspects form shape, field count, or config.

export const CLIENT_TYPES = ["renter", "buyer", "seller"] as const
export type ClientType = (typeof CLIENT_TYPES)[number]

export function isClientType(value: unknown): value is ClientType {
  return typeof value === "string" && (CLIENT_TYPES as readonly string[]).includes(value)
}

/**
 * The canonical client type for a submission. A caller may state a canonical
 * client type explicitly; anything else (undefined, a legacy value, garbage)
 * normalizes to 'renter'. This guarantees the value can never violate the
 * leads_lead_type_check constraint, and it is derived ONLY from an explicit
 * client type — never from the form, its field count, or its configuration.
 */
export function resolveClientType(sentLeadType?: string | null): ClientType {
  return isClientType(sentLeadType) ? sentLeadType : "renter"
}
