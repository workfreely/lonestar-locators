/**
 * PROPERTY-LEVEL washer/dryer — what property_catalog already records.
 *
 * SEPARATE FROM lib/leads/washerDryer.ts ON PURPOSE. That module is imported by the PUBLIC
 * client recommendation page for its pill; anything living beside it ships to every renter's
 * browser. These constants are Property Intelligence's own vocabulary and have no business
 * there, so they live here, where only the CRM editor and its API route import them.
 *
 * A DIFFERENT vocabulary from the client-facing pair, and deliberately so. The catalog models
 * two independent facts, each with a qualifier the client-facing status cannot express:
 *
 *   washer_dryer_included     Yes 971 · Select Units 224 · No 13 · Specific Floor Plans 3
 *   washer_dryer_connections  Yes 302 · Select Units 61  · No 5
 *
 * "Select Units" is exactly why the client-facing status is confirmed per client rather than
 * read from here: a property-level Yes is not a promise about the floor plan one client would
 * lease. These options exist so the editor can RECORD what was verified about the property;
 * nothing maps them onto a client's card automatically.
 */

/**
 * The stored vocabulary for property_catalog.washer_dryer_included. Verbatim — these strings
 * are the values already in the column, so an edit never orphans an existing row.
 *
 * MENU ORDER, not precedence: the answers a locator actually records lead, and "Not Verified"
 * sits at the end because it is the state they are leaving rather than one they choose. It is
 * still the SELECTED option for an unverified field — a <select> matches its value wherever
 * that option appears in the list, so last in the menu and current in the box are compatible.
 */
export const CATALOG_WD_INCLUDED_OPTIONS = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
  { value: "Select Units", label: "Select Units" },
  { value: "Specific Floor Plans", label: "Specific Floor Plans" },
  { value: "", label: "Not Verified" },
] as const

/** The stored vocabulary for property_catalog.washer_dryer_connections. Same menu order; it has
 *  no "Specific Floor Plans" because the column has never held one. */
export const CATALOG_WD_CONNECTIONS_OPTIONS = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
  { value: "Select Units", label: "Select Units" },
  { value: "", label: "Not Verified" },
] as const

const INCLUDED = new Set(CATALOG_WD_INCLUDED_OPTIONS.map((o) => o.value).filter(Boolean))
const CONNECTIONS = new Set(CATALOG_WD_CONNECTIONS_OPTIONS.map((o) => o.value).filter(Boolean))

/** Exactly one of the stored values, or null. Fails closed, like the client-facing validator. */
export function asCatalogWasherDryerIncluded(v: unknown): string | null {
  return typeof v === "string" && INCLUDED.has(v as never) ? v : null
}
export function asCatalogWasherDryerConnections(v: unknown): string | null {
  return typeof v === "string" && CONNECTIONS.has(v as never) ? v : null
}
