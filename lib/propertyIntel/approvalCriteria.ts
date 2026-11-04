/**
 * APPROVAL CRITERIA — the one vocabulary the editor, the save route and the tests all read.
 *
 * ── WHY A SHARED MODULE AND NOT TWO LISTS ───────────────────────────────────────────────────
 * The panel offers options; the route decides which are acceptable; the database CHECK decides
 * which are storable. Three copies of one vocabulary is three chances to drift, and the failure
 * is silent in the worst direction: the agent picks an option, the save reports success, and the
 * value is rejected as a bad field name they never see. So the tokens live here once, the panel
 * renders them, and the route validates against the same constants.
 *
 * ── NULL IS A WORD IN THIS VOCABULARY ───────────────────────────────────────────────────────
 * Every field's unknown state is NULL, and it is a real answer: nobody has asked. It is NEVER
 * "not accepted" and never 0. The editor shows it as "Unknown", and the only way a stored value
 * returns to it is the deliberate clear — which is why each field is in OWNER_CLEARABLE_FIELDS.
 *
 * ── THESE ARE CRITERIA, NOT PROMISES ────────────────────────────────────────────────────────
 * An entered value is what a leasing office is REPORTED to accept. Whether it was confirmed with
 * that office is a separate fact, carried by provenance (a save with a source is recorded
 * verified, one without it unverified) and by the one explicit date below. Nothing here hardens
 * an agent's note into an office's policy on its own.
 */

/** What a property will accept. The token set 20261110000000 constrains. */
export const APPROVAL_STATUSES = ["accepted", "accepted_if_paid", "not_accepted"] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

/** What has to be true of the outstanding balance. Shared by all three incident groups. */
export const BALANCE_REQUIREMENTS = ["must_be_paid", "payments_or_plan", "balance_ok"] as const
export type BalanceRequirement = (typeof BALANCE_REQUIREMENTS)[number]

/** The oldest sane minimum age. Mirrors the CHECK, so a typo is caught beside the input. */
export const MAX_AGE_YEARS = 20

type Option = { value: string; label: string }

/** Broken lease. "Accepted if the balance is paid" is a real, distinct policy — several
 *  properties state exactly it — and must never be flattened into "not accepted". */
export const BROKEN_LEASE_STATUS_OPTIONS: Option[] = [
  { value: "", label: "Unknown" },
  { value: "accepted", label: "Accepted" },
  { value: "accepted_if_paid", label: "Accepted if paid off" },
  { value: "not_accepted", label: "Not accepted" },
]

/** Eviction. Same three tokens, said the way a leasing office says them about an eviction.
 *  Anything conditional on something OTHER than the balance — corporate review, case by case —
 *  belongs in the notes, where it stays a question instead of becoming a rule. */
export const EVICTION_STATUS_OPTIONS: Option[] = [
  { value: "", label: "Unknown" },
  { value: "accepted", label: "Accepted" },
  { value: "accepted_if_paid", label: "Conditional — accepted if balances are paid" },
  { value: "not_accepted", label: "Not accepted" },
]

/** Apartment / rental debt and collections. NOT medical debt and NOT credit-card collections:
 *  properties weigh those differently, and this column says nothing about them. */
export const RENTAL_DEBT_STATUS_OPTIONS: Option[] = [
  { value: "", label: "Unknown" },
  { value: "accepted", label: "Accepted" },
  { value: "accepted_if_paid", label: "Accepted if paid off" },
  { value: "not_accepted", label: "Not accepted" },
]

export const BALANCE_REQUIREMENT_OPTIONS: Option[] = [
  { value: "", label: "Unknown" },
  { value: "must_be_paid", label: "Must be paid in full ($0 outstanding)" },
  { value: "payments_or_plan", label: "Payments made or payment plan accepted" },
  { value: "balance_ok", label: "Balance does not matter" },
]

/** A requirement with three states. "Not required" is a FINDING — an office that said it does
 *  not care — and has to be storable as one, which is why this is not a checkbox. */
export const POSITIVE_HISTORY_OPTIONS: Option[] = [
  { value: "", label: "Unknown" },
  { value: "yes", label: "Required after the incident" },
  { value: "no", label: "Not required" },
]

/**
 * ── CRIMINAL BACKGROUND ─────────────────────────────────────────────────────────────────────
 *
 * The vocabulary is REUSED, not invented. property_approval_policy — the older, import-written
 * policy table — already carries felony_policy, felony_min_age_years, felony_restrictions and
 * their misdemeanor twins, plus background_screening_notes. Six properties hold a policy there
 * today and every one of them says the same word: "Case-by-Case". So that is a token here, and
 * the columns this editor writes carry the SAME NAMES, which is what makes the backfill a
 * column-to-column copy with nothing parsed and nothing guessed.
 *
 * ── A POLICY IS NOT A VERDICT ON A PERSON ───────────────────────────────────────────────────
 * Everything here describes what a PROPERTY will consider. Nothing here describes a renter, and
 * nothing in this file decides whether anybody is approved. "Considered" does not mean approved
 * and "Case-by-Case" is not a soft no — it is the office saying a human reads the file.
 *
 * ── THREE STATES, AND UNKNOWN IS THE DEFAULT ────────────────────────────────────────────────
 * NULL means nobody has asked, exactly as it does for every criterion above. It is never
 * "Not Considered": refusing to accept a felony is a FINDING, and a property nobody has asked
 * must never be presented as one.
 */
export const CRIMINAL_POLICIES = ["considered", "case_by_case", "not_considered"] as const
export type CriminalPolicy = (typeof CRIMINAL_POLICIES)[number]

/** Felony. "Considered" is the office's word, and it promises review — never approval. */
export const FELONY_POLICY_OPTIONS: Option[] = [
  { value: "", label: "Unknown" },
  { value: "considered", label: "Considered" },
  { value: "case_by_case", label: "Case-by-Case" },
  { value: "not_considered", label: "Not Considered" },
]

/** Misdemeanor. The same three tokens: a property may weigh the two very differently, which is
 *  why they are separate columns rather than one "criminal" answer. */
export const MISDEMEANOR_POLICY_OPTIONS: Option[] = [
  { value: "", label: "Unknown" },
  { value: "considered", label: "Considered" },
  { value: "case_by_case", label: "Case-by-Case" },
  { value: "not_considered", label: "Not Considered" },
]

/**
 * WHAT THE LOOKBACK IS MEASURED FROM.
 *
 * The one distinction a years-only column cannot carry, and it is not pedantry: an offense date
 * and a conviction date can sit years apart, so "7 years" means two different things depending
 * on which one the office counts from. NULL means the office did not say — and an unstated basis
 * must never be silently read as a conviction date, because a CHARGE IS NOT A CONVICTION.
 */
export const LOOKBACK_BASES = ["offense_date", "conviction_date"] as const
export type LookbackBasis = (typeof LOOKBACK_BASES)[number]

export const LOOKBACK_BASIS_OPTIONS: Option[] = [
  { value: "", label: "Unknown" },
  { value: "offense_date", label: "Offense date" },
  { value: "conviction_date", label: "Conviction date" },
]

/**
 * OFFENSE CATEGORIES A PROPERTY RESTRICTS.
 *
 * The set is what the leasing offices in this market actually name — "nothing assault related",
 * "no sex offenses" — so the categories are the restriction's own vocabulary rather than a legal
 * taxonomy. `other` is deliberate: a category this list does not cover is still a restriction,
 * and the free-text field beside it carries the office's wording.
 *
 * STORED AS A SET, and an empty set is NOT a value. A property with no categories selected has
 * told us nothing about categories; it has not told us that nothing is restricted. So clearing
 * them writes NULL, the same unknown every other field uses.
 */
export const OFFENSE_TYPES = ["drug", "dwi", "assault", "theft_fraud", "sex_offense", "other"] as const
export type OffenseType = (typeof OFFENSE_TYPES)[number]

export const OFFENSE_TYPE_OPTIONS: Option[] = [
  { value: "drug", label: "Drug Related" },
  { value: "dwi", label: "DWI" },
  { value: "assault", label: "Assault" },
  { value: "theft_fraud", label: "Theft / Fraud" },
  { value: "sex_offense", label: "Sex Offense" },
  { value: "other", label: "Other" },
]

/**
 * The offense set as the panel holds it: tokens joined by commas, in the canonical order above.
 *
 * ONE STATE SHAPE FOR EVERY FIELD is what lets the editor compare, validate and send all of them
 * through the same three lines. A second state shape for one array field would need its own
 * change detection, and change detection is what decides whether a save touches a column at all.
 */
export function offenseTypesToInput(v: unknown): string {
  const list = Array.isArray(v) ? v.map((x) => String(x)) : typeof v === "string" && v.trim() ? v.split(",") : []
  const seen = new Set(list.map((x) => x.trim()).filter(Boolean))
  return OFFENSE_TYPES.filter((t) => seen.has(t)).join(",")
}

/** Add or remove one category, returning the canonical joined string. */
export function toggleOffenseType(current: string, token: string): string {
  const seen = new Set(offenseTypesToInput(current).split(",").filter(Boolean))
  if (seen.has(token)) seen.delete(token)
  else seen.add(token)
  return OFFENSE_TYPES.filter((t) => seen.has(t)).join(",")
}

/**
 * Payload key → property_catalog column, with the shape each value is parsed as.
 *
 * The route iterates THIS, so a column reachable from the editor is exactly a column listed
 * here — a crafted body cannot reach any other, and adding a field is one line in one place.
 */
export const APPROVAL_FIELDS: Record<string, {
  column: string
  kind: "status" | "balanceRequirement" | "age" | "money" | "tri" | "text" | "notes" | "date"
        | "criminalPolicy" | "lookbackBasis" | "offenseTypes"
  /** Which prepared migration the column comes from. The route probes the two groups
   *  SEPARATELY, so criminal background can ship before its migration is applied without
   *  hiding the requirement fields that are already live. */
  group?: "criminal"
}> = {
  brokenLeaseStatus:                  { column: "broken_lease_status",                     kind: "status" },
  brokenLeaseMinAgeYears:             { column: "broken_lease_min_age_years",              kind: "age" },
  brokenLeaseBalanceRequirement:      { column: "broken_lease_balance_requirement",        kind: "balanceRequirement" },
  brokenLeaseMaxBalance:              { column: "broken_lease_max_balance",                kind: "money" },
  brokenLeasePositiveHistoryRequired: { column: "broken_lease_positive_history_required",  kind: "tri" },
  evictionStatus:                     { column: "eviction_status",                         kind: "status" },
  evictionMinAgeYears:                { column: "eviction_min_age_years",                   kind: "age" },
  evictionBalanceRequirement:         { column: "eviction_balance_requirement",             kind: "balanceRequirement" },
  evictionPositiveHistoryRequired:    { column: "eviction_positive_history_required",       kind: "tri" },
  rentalDebtStatus:                   { column: "rental_debt_status",                       kind: "status" },
  rentalDebtBalanceRequirement:       { column: "rental_debt_balance_requirement",          kind: "balanceRequirement" },
  rentalDebtMaxBalance:               { column: "rental_debt_max_balance",                  kind: "money" },
  screeningAdditionalDeposit:         { column: "screening_additional_deposit",             kind: "text" },
  screeningRiskFee:                   { column: "screening_risk_fee",                       kind: "text" },
  screeningGuarantorProgram:          { column: "screening_guarantor_program",              kind: "text" },
  screeningRequirementsCheckedAt:     { column: "screening_requirements_checked_at",        kind: "date" },
  // ── CRIMINAL BACKGROUND ───────────────────────────────────────────────────────────────────
  // Seven of these nine column names are property_approval_policy's own, on purpose: the same
  // name means the same thing in both tables, and the proposed backfill is a straight copy.
  // criminal_restricted_offense_types and criminal_lookback_basis are the two genuinely new
  // ones — the policy table has no structured category set and no way to say whether its
  // min_age_years counts from the offense or the conviction.
  felonyPolicy:                   { column: "felony_policy",                      kind: "criminalPolicy", group: "criminal" },
  felonyMinAgeYears:              { column: "felony_min_age_years",               kind: "age",            group: "criminal" },
  felonyRestrictions:             { column: "felony_restrictions",                kind: "text",           group: "criminal" },
  misdemeanorPolicy:              { column: "misdemeanor_policy",                 kind: "criminalPolicy", group: "criminal" },
  misdemeanorMinAgeYears:         { column: "misdemeanor_min_age_years",          kind: "age",            group: "criminal" },
  misdemeanorRestrictions:        { column: "misdemeanor_restrictions",           kind: "text",           group: "criminal" },
  criminalRestrictedOffenseTypes: { column: "criminal_restricted_offense_types",  kind: "offenseTypes",   group: "criminal" },
  criminalLookbackBasis:          { column: "criminal_lookback_basis",            kind: "lookbackBasis",  group: "criminal" },
  backgroundScreeningNotes:       { column: "background_screening_notes",         kind: "notes",          group: "criminal" },
}

/** The columns the editor reads back, in one list so the route's SELECT and the tests agree.
 *  The criminal group is EXCLUDED here and read separately — see CRIMINAL_COLUMNS. */
export const APPROVAL_COLUMNS: string[] =
  Object.values(APPROVAL_FIELDS).filter((f) => f.group !== "criminal").map((f) => f.column)

/** The criminal-background columns, read and probed on their own.
 *
 *  Separate because availability is a separate FACT. Folding them into the select above would
 *  mean one unapplied migration hides Broken Lease and Eviction too — a working editor broken by
 *  a field that is not there yet, which is the opposite of what the tolerant read exists for. */
export const CRIMINAL_COLUMNS: string[] =
  Object.values(APPROVAL_FIELDS).filter((f) => f.group === "criminal").map((f) => f.column)

/** The criminal-background payload keys, for the route's probe and the panel's change set. */
export const CRIMINAL_KEYS: string[] =
  Object.keys(APPROVAL_FIELDS).filter((k) => APPROVAL_FIELDS[k].group === "criminal")

/** Free text on a screening charge is capped, not truncated silently — see parseApprovalValue. */
export const APPROVAL_TEXT_MAX = 300

/** Notes are capped where credit_screening_notes is capped, for the same reason: the sentence
 *  that states an exception is the whole value, and half of it says something else. */
export const APPROVAL_NOTES_MAX = 4000

/**
 * One supplied value → what to write.
 *
 *   { write: null }   the owner deliberately returned it to unknown
 *   { write: <v> }    a value to store
 *   { bad: true }     present but unusable; the caller REJECTS the request rather than dropping
 *                     it, because a save that silently ignores what was typed is worse than one
 *                     that fails and says which field.
 *
 * Blank is the clear, not "leave it alone": the editor only sends a field it SAW CHANGE, so a
 * field arriving blank means the agent emptied it on purpose.
 */
export function parseApprovalValue(
  kind: (typeof APPROVAL_FIELDS)[string]["kind"],
  raw: unknown,
): { write: string | number | boolean | string[] | null } | { bad: true } {
  if (raw === null || raw === undefined) return { write: null }
  const t = String(raw).trim()
  if (t === "") return { write: null }

  if (kind === "status") {
    return (APPROVAL_STATUSES as readonly string[]).includes(t) ? { write: t } : { bad: true }
  }
  if (kind === "balanceRequirement") {
    return (BALANCE_REQUIREMENTS as readonly string[]).includes(t) ? { write: t } : { bad: true }
  }
  if (kind === "tri") {
    if (t === "yes" || t === "true") return { write: true }
    if (t === "no" || t === "false") return { write: false }
    return { bad: true }
  }
  if (kind === "age") {
    const n = Number(t)
    if (!Number.isInteger(n) || n < 0 || n > MAX_AGE_YEARS) return { bad: true }
    return { write: n }
  }
  if (kind === "money") {
    const n = Number(t.replace(/[$,\s]/g, ""))
    // Zero IS a value here: "the balance must be $0" is a real ceiling, said as a number.
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return { bad: true }
    return { write: Math.round(n * 100) / 100 }
  }
  if (kind === "date") {
    // Date-only, the column's own type. An unparseable date is rejected rather than coerced to
    // today, which would invent a confirmation that never happened.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(new Date(`${t}T00:00:00Z`).getTime())) return { bad: true }
    return { write: t }
  }
  if (kind === "criminalPolicy") {
    return (CRIMINAL_POLICIES as readonly string[]).includes(t) ? { write: t } : { bad: true }
  }
  if (kind === "lookbackBasis") {
    return (LOOKBACK_BASES as readonly string[]).includes(t) ? { write: t } : { bad: true }
  }
  if (kind === "offenseTypes") {
    // The panel sends the canonical joined string. An unknown token is REJECTED rather than
    // dropped: silently storing four of the five categories an agent picked would be a policy
    // nobody entered.
    const tokens = t.split(",").map((x) => x.trim()).filter(Boolean)
    if (tokens.some((x) => !(OFFENSE_TYPES as readonly string[]).includes(x))) return { bad: true }
    const canonical = OFFENSE_TYPES.filter((x) => tokens.includes(x))
    // An empty set is the clear, not a stored "nothing is restricted".
    return canonical.length ? { write: [...canonical] } : { write: null }
  }
  if (kind === "notes") {
    // The cap credit_screening_notes already uses. Exceptions are where a screening policy gets
    // long, and truncating the sentence that names the exception would invert its meaning.
    if (t.length > APPROVAL_NOTES_MAX) return { bad: true }
    return { write: t }
  }
  // text
  if (t.length > APPROVAL_TEXT_MAX) return { bad: true }
  return { write: t }
}

/**
 * One field the editor asked to change, resolved against the vocabulary above.
 *
 * `clear: true` is the deliberate return to UNKNOWN; anything else carries a value to write. The
 * route turns these into enrichment candidates and the integration test drives the real writer
 * with them, so the save path under test is the save path that ships — there is no second copy of
 * this decision anywhere.
 */
export type ApprovalWrite = {
  key: string
  column: string
  /** string[] is the offense-category set. The writer's toStoredText already records an array as
   *  JSON in the audit trail, so provenance carries the whole set rather than a count. */
  value: string | number | boolean | string[] | null
  clear: boolean
}

/**
 * The whole approval section of a request body → what to write, and what to refuse.
 *
 * `keys` is every approval field PRESENT in the body. It is returned separately from `writes`
 * because its emptiness is the question the caller asks first: no approval key means this save is
 * not about approval criteria at all, and must not pay for a column probe or be refused when the
 * columns are missing.
 *
 * A rejected field does NOT cancel the others here — the caller collects every bad field name so
 * the editor can point at all of them at once, then refuses the request as a whole. A save that
 * silently drops one of four values the agent typed is worse than one that fails and says which.
 */
export function planApprovalWrites(body: Record<string, unknown>): {
  keys: string[]
  writes: ApprovalWrite[]
  rejected: string[]
} {
  const keys = Object.keys(APPROVAL_FIELDS).filter((k) => k in body)
  const writes: ApprovalWrite[] = []
  const rejected: string[] = []
  for (const key of keys) {
    const spec = APPROVAL_FIELDS[key]
    const parsed = parseApprovalValue(spec.kind, body[key])
    if ("bad" in parsed) { rejected.push(key); continue }
    writes.push({ key, column: spec.column, value: parsed.write, clear: parsed.write === null })
  }
  return { keys, writes, rejected }
}

/** A stored value → what the input shows. Null stays BLANK; it is never rendered as 0 or "no". */
export function approvalValueToInput(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "boolean") return v ? "yes" : "no"
  // A text[] column — the offense categories — reads back as the same canonical joined string the
  // chips produce, so the change set compares like with like and an untouched set is never sent.
  if (Array.isArray(v)) return offenseTypesToInput(v)
  return String(v)
}

/**
 * Does this group hold anything at all?
 *
 * The panel hides a group's detail fields under "Not accepted", because age and balance rules are
 * moot when nothing is accepted — EXCEPT when they already hold a value. A hidden field would
 * still be preserved (the panel only sends what changed), but hiding a stored requirement would
 * leave the agent unable to see or correct it, which is its own kind of loss.
 */
export function groupHasStoredDetail(values: Array<unknown>): boolean {
  return values.some((v) => v !== null && v !== undefined && v !== "")
}
