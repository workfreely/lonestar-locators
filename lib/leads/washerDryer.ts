/**
 * WASHER & DRYER — the client-facing status for ONE client-property pair.
 *
 * The locator confirms this per client, because the answer genuinely differs by floor plan:
 * property_catalog records "Select Units" on 224 properties and "Specific Floor Plans" on 3,
 * so a property-level "Yes" is not a promise that THIS client's apartment has one. Nothing here
 * reads the catalog, and nothing populates this value automatically — a status appears on a
 * client's card only because a person put it there.
 *
 * NULL is "not verified", and it is the default. That is deliberate: an un-set value renders
 * nothing at all, so silence is never mistaken for a claim, and no existing row needs a backfill.
 *
 * ── ONE VOCABULARY, DEFINED ONCE ────────────────────────────────────────────────────────────
 * The workspace dropdown, the client pill and the frozen snapshot all read their wording from
 * here, so the three can never drift into saying slightly different things about the same
 * apartment. A later Property Intelligence W/D field would map ITS values into this vocabulary
 * rather than restating it.
 */

/** The two things worth telling a client. Anything else is "not verified" (null). */
export type WasherDryerStatus = "included" | "hookups"

/** The stored values, for a CHECK constraint and for validating anything inbound. */
export const WASHER_DRYER_STATUSES = ["included", "hookups"] as const

/** What the CLIENT reads. Never abbreviated — "W/D" is jargon to a renter. */
export const WASHER_DRYER_LABEL: Record<WasherDryerStatus, string> = {
  included: "Washer & Dryer Included",
  hookups: "Washer & Dryer Hookups",
}

/** What the LOCATOR picks from. The empty option is the default and clears the value. */
export const WASHER_DRYER_OPTIONS: { value: "" | WasherDryerStatus; label: string }[] = [
  { value: "", label: "Not verified" },
  { value: "included", label: WASHER_DRYER_LABEL.included },
  { value: "hookups", label: WASHER_DRYER_LABEL.hookups },
]

/**
 * Anything that is not exactly one of the two known statuses is NOT VERIFIED.
 *
 * Fails closed on purpose: a value that arrives misspelled, renamed or from a future version is
 * shown as nothing rather than guessed into one of the two. Telling a renter an apartment has a
 * washer when it has hookups is the one mistake this feature could make, so every uncertain
 * input lands on silence.
 */
export function asWasherDryerStatus(v: unknown): WasherDryerStatus | null {
  return v === "included" || v === "hookups" ? v : null
}

/** The pill's text, or null when nothing should render. */
export function washerDryerLabel(v: unknown): string | null {
  const s = asWasherDryerStatus(v)
  return s ? WASHER_DRYER_LABEL[s] : null
}

/**
 * The pill's modifier class, or null when nothing should render.
 *
 * "Included" is the stronger claim and gets the green treatment; hookups are a neutral fact
 * about the unit, so they read grey. The colours themselves live in the client page's own CSS
 * tokens — this returns only which of the two a card should use.
 */
export function washerDryerPillClass(v: unknown): string | null {
  const s = asWasherDryerStatus(v)
  if (!s) return null
  return s === "included" ? "lbr-wd lbr-wd--inc" : "lbr-wd lbr-wd--hk"
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PROPERTY-LEVEL washer/dryer — what property_catalog already records.
//
// A DIFFERENT vocabulary from the client-facing pair above, and deliberately so. The catalog
// models two independent facts, each with a qualifier the client-facing status cannot express:
//
//   washer_dryer_included     Yes 971 · Select Units 224 · No 13 · Specific Floor Plans 3
//   washer_dryer_connections  Yes 302 · Select Units 61  · No 5
//
// "Select Units" is exactly why the client-facing status is confirmed per client rather than
// read from here: a property-level Yes is not a promise about the floor plan one client would
// lease. These options exist so the Property Intelligence editor can RECORD what was verified
// about the property; nothing maps them onto a client's card automatically.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The stored vocabulary for property_catalog.washer_dryer_included. Verbatim — these strings
 *  are the values already in the column, so an edit never orphans an existing row. */
export const CATALOG_WD_INCLUDED_OPTIONS = [
  { value: "", label: "Not Verified" },
  { value: "Yes", label: "Yes" },
  { value: "Select Units", label: "Select Units" },
  { value: "Specific Floor Plans", label: "Specific Floor Plans" },
  { value: "No", label: "No" },
] as const

/** The stored vocabulary for property_catalog.washer_dryer_connections. It has no
 *  "Specific Floor Plans" because the column has never held one. */
export const CATALOG_WD_CONNECTIONS_OPTIONS = [
  { value: "", label: "Not Verified" },
  { value: "Yes", label: "Yes" },
  { value: "Select Units", label: "Select Units" },
  { value: "No", label: "No" },
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
