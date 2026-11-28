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
 * apartment. The CHECK constraint on both tables is kept in step with WASHER_DRYER_STATUSES by
 * its own guard, so a value this module admits can always be stored. A later Property
 * Intelligence W/D field would map ITS values into this vocabulary rather than restating it.
 */

/**
 * The three things worth telling a client. Anything else is "not verified" (null).
 *
 * They are ordered by what the renter gets, strongest first: a machine in the apartment, the
 * plumbing for one they bring, and a shared room in the building. The third is a different KIND
 * of answer from the first two — it is not about the unit at all — which is precisely why it
 * needed its own value instead of being squeezed into "hookups". A locator who had verified a
 * laundry room previously had to choose between saying nothing and saying something untrue.
 */
export type WasherDryerStatus = "included" | "hookups" | "laundry_onsite"

/** The stored values, for a CHECK constraint and for validating anything inbound. */
export const WASHER_DRYER_STATUSES = ["included", "hookups", "laundry_onsite"] as const

/** What the CLIENT reads. Never abbreviated — "W/D" is jargon to a renter. */
export const WASHER_DRYER_LABEL: Record<WasherDryerStatus, string> = {
  included: "Washer & Dryer Included",
  hookups: "Washer & Dryer Hookups",
  laundry_onsite: "Laundry Facilities On-Site",
}

/** What the LOCATOR picks from. The empty option is the default and clears the value. */
export const WASHER_DRYER_OPTIONS: { value: "" | WasherDryerStatus; label: string }[] = [
  { value: "", label: "Not verified" },
  { value: "included", label: WASHER_DRYER_LABEL.included },
  { value: "hookups", label: WASHER_DRYER_LABEL.hookups },
  { value: "laundry_onsite", label: WASHER_DRYER_LABEL.laundry_onsite },
]

/**
 * Anything that is not exactly one of the known statuses is NOT VERIFIED.
 *
 * Fails closed on purpose: a value that arrives misspelled, renamed or from a future version is
 * shown as nothing rather than guessed into one of the three. Telling a renter an apartment has a
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
 * "Included" is the stronger claim and gets the green treatment; hookups and an on-site laundry
 * room are neutral facts, so they read grey. The colours themselves live in the client page's own
 * CSS tokens — this returns only which treatment a card should use.
 *
 * The laundry room has its OWN grey class rather than sharing the hookups one. They say different
 * things and only happen to look alike today; a future restyle of either must not silently move
 * the other.
 */
const PILL_CLASS: Record<WasherDryerStatus, string> = {
  included: "lbr-wd lbr-wd--inc",
  hookups: "lbr-wd lbr-wd--hk",
  laundry_onsite: "lbr-wd lbr-wd--fac",
}
export function washerDryerPillClass(v: unknown): string | null {
  const s = asWasherDryerStatus(v)
  return s ? PILL_CLASS[s] : null
}
