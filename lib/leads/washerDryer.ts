/**
 * WASHER & DRYER — ONE vocabulary, for the property and for the client-property pair.
 *
 * ── WHAT THIS REPLACED ──────────────────────────────────────────────────────────────────────
 * There used to be two vocabularies describing the same amenity, and they could not talk to
 * each other. The client-facing status (included | hookups) lived on lead_property_reasons and
 * was confirmed per client. Property Intelligence had its own pair of columns —
 * washer_dryer_included (Yes · No · Select Units · Specific Floor Plans) and
 * washer_dryer_connections (Yes · No · Select Units) — edited from the map, in a different set
 * of words. Confirming "Laundry Facilities On-Site" for a client left the map reading
 * "Not verified", because nothing joined the two.
 *
 * They are now one list, stored in one spelling, in three places that mean three different
 * things:
 *
 *   property_catalog.washer_dryer_status            what is true of the PROPERTY
 *   lead_property_reasons.washer_dryer_status       what a locator CONFIRMED for one client
 *   client_recommendation_share_items.…             that confirmation, frozen at send
 *
 * ── THE TWO LEGACY COLUMNS ARE STILL THERE, AND STILL HOLD WHAT THEY HELD ───────────────────
 * washer_dryer_included and washer_dryer_connections were NOT collapsed into the new column.
 * 107 properties carry a meaningful value in BOTH — "included in select units, connections
 * elsewhere" is two facts, and one dropdown cannot say two things. The new column is derived
 * from them and is what every surface now reads and writes; the originals are untouched, so
 * nothing that was verified has been thrown away.
 *
 * ── NULL IS "NOT VERIFIED", AND IT IS THE DEFAULT ───────────────────────────────────────────
 * An un-set value renders nothing at all, so silence is never mistaken for a claim, and no
 * existing row needs a backfill. "No Laundry Facilities" is a different thing entirely: it is a
 * CONFIRMED finding, which is why it is a value and not the absence of one.
 */

/**
 * The five answers worth recording, strongest first. Anything else is "not verified" (null).
 *
 * They are not all about the same thing, and that is the point. The first three describe the
 * UNIT (a machine in it, the plumbing for one, or either in some floor plans but not all); the
 * fourth describes the BUILDING; the fifth is the confirmed absence of both.
 */
export type WasherDryerStatus =
  | "included"
  | "hookups"
  | "select_units"
  | "laundry_onsite"
  | "none"

/** The stored values, for the CHECK constraints and for validating anything inbound. */
export const WASHER_DRYER_STATUSES = [
  "included", "hookups", "select_units", "laundry_onsite", "none",
] as const

/** What the CLIENT reads. Never abbreviated — "W/D" is jargon to a renter. */
export const WASHER_DRYER_LABEL: Record<WasherDryerStatus, string> = {
  included: "Washer & Dryer Included",
  hookups: "Washer & Dryer Hookups",
  select_units: "Washer & Dryer — Select Units",
  laundry_onsite: "Laundry Facilities On-Site",
  none: "No Laundry Facilities",
}

/**
 * What the LOCATOR picks from — the SAME menu in the reasons editor and in the map's Edit
 * Property panel. The empty option is the default and clears the value, and it appears exactly
 * once: the map used to render its own hardcoded "Not verified" above a list that ended in
 * another one.
 */
export const WASHER_DRYER_OPTIONS: { value: "" | WasherDryerStatus; label: string }[] = [
  { value: "", label: "Not verified" },
  ...WASHER_DRYER_STATUSES.map((v) => ({ value: v, label: WASHER_DRYER_LABEL[v] })),
]

/**
 * Anything that is not exactly one of the known statuses is NOT VERIFIED.
 *
 * Fails closed on purpose: a value that arrives misspelled, renamed or from a future version is
 * shown as nothing rather than guessed into one of the five. Telling a renter an apartment has a
 * washer when it has hookups — or when the washer is in a shared room downstairs — is the one
 * mistake this feature could make, so every uncertain input lands on silence.
 *
 * Membership is read from WASHER_DRYER_STATUSES rather than listed again, so adding a status
 * cannot leave the validator behind the vocabulary.
 */
const STATUS_SET: ReadonlySet<string> = new Set(WASHER_DRYER_STATUSES)
export function asWasherDryerStatus(v: unknown): WasherDryerStatus | null {
  return typeof v === "string" && STATUS_SET.has(v) ? (v as WasherDryerStatus) : null
}

/** The pill's text, or null when nothing should render. */
export function washerDryerLabel(v: unknown): string | null {
  const s = asWasherDryerStatus(v)
  return s ? WASHER_DRYER_LABEL[s] : null
}

/**
 * The pill's modifier class, or null when nothing should render.
 *
 * "Included" is the only unqualified good news and gets the green treatment. Everything else —
 * hookups, a partial availability, a shared laundry room, a confirmed absence — is a neutral
 * fact and reads grey. The colours themselves live in the client page's own CSS tokens; this
 * returns only which treatment a card should use.
 *
 * Each status has its OWN class even where two look alike today. They say different things, and
 * a future restyle of one must not silently move the others.
 */
const PILL_CLASS: Record<WasherDryerStatus, string> = {
  included: "lbr-wd lbr-wd--inc",
  hookups: "lbr-wd lbr-wd--hk",
  select_units: "lbr-wd lbr-wd--sel",
  laundry_onsite: "lbr-wd lbr-wd--fac",
  none: "lbr-wd lbr-wd--none",
}
export function washerDryerPillClass(v: unknown): string | null {
  const s = asWasherDryerStatus(v)
  return s ? PILL_CLASS[s] : null
}

/**
 * THE ONE-TIME DERIVATION from the two legacy columns, as TypeScript, so the migration's SQL and
 * every read-side fallback can be checked against the same rule.
 *
 * The precedence is the one the Lead Board card already used, so a property's derived status
 * says what its card has been saying all along:
 *
 *   included = Yes                              → the unit has one
 *   connections = Yes                           → the unit has the plumbing
 *   included = Select Units / Specific Floor Plans → some floor plans do
 *   connections = Select Units                  → some floor plans do
 *
 * "No" DELIBERATELY DERIVES NOTHING. washer_dryer_included = 'No' means there is no machine in
 * the unit; it does not mean there is no laundry in the building, and turning it into "No
 * Laundry Facilities" would put a claim in front of a renter that nobody ever verified. That
 * value is only ever set by a person choosing it.
 */
export function deriveWasherDryerStatus(
  included: string | null | undefined,
  connections: string | null | undefined,
): WasherDryerStatus | null {
  if (included === "Yes") return "included"
  if (connections === "Yes") return "hookups"
  if (included === "Select Units" || included === "Specific Floor Plans") return "select_units"
  if (connections === "Select Units") return "select_units"
  return null
}
