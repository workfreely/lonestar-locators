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
  { value: "", label: "Unknown — nobody has asked" },
  { value: "accepted", label: "Accepted" },
  { value: "accepted_if_paid", label: "Accepted if paid off" },
  { value: "not_accepted", label: "Not accepted" },
]

/** Eviction. Same three tokens, said the way a leasing office says them about an eviction.
 *  Anything conditional on something OTHER than the balance — corporate review, case by case —
 *  belongs in the notes, where it stays a question instead of becoming a rule. */
export const EVICTION_STATUS_OPTIONS: Option[] = [
  { value: "", label: "Unknown — nobody has asked" },
  { value: "accepted", label: "Accepted" },
  { value: "accepted_if_paid", label: "Conditional — accepted if balances are paid" },
  { value: "not_accepted", label: "Not accepted" },
]

/** Apartment / rental debt and collections. NOT medical debt and NOT credit-card collections:
 *  properties weigh those differently, and this column says nothing about them. */
export const RENTAL_DEBT_STATUS_OPTIONS: Option[] = [
  { value: "", label: "Unknown — nobody has asked" },
  { value: "accepted", label: "Accepted" },
  { value: "accepted_if_paid", label: "Accepted if paid off" },
  { value: "not_accepted", label: "Not accepted" },
]

export const BALANCE_REQUIREMENT_OPTIONS: Option[] = [
  { value: "", label: "Unknown" },
  { value: "must_be_paid", label: "Must be paid in full ($0 outstanding)" },
  { value: "payments_or_plan", label: "Payments made, or a payment plan, accepted" },
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
 * Payload key → property_catalog column, with the shape each value is parsed as.
 *
 * The route iterates THIS, so a column reachable from the editor is exactly a column listed
 * here — a crafted body cannot reach any other, and adding a field is one line in one place.
 */
export const APPROVAL_FIELDS: Record<string, { column: string; kind: "status" | "balanceRequirement" | "age" | "money" | "tri" | "text" | "date" }> = {
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
}

/** The columns the editor reads back, in one list so the route's SELECT and the tests agree. */
export const APPROVAL_COLUMNS: string[] = Object.values(APPROVAL_FIELDS).map((f) => f.column)

/** Free text on a screening charge is capped, not truncated silently — see parseApprovalValue. */
export const APPROVAL_TEXT_MAX = 300

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
): { write: string | number | boolean | null } | { bad: true } {
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
  value: string | number | boolean | null
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
