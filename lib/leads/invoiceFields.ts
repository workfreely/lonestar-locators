// Canonical invoice-field logic — the ONE source of truth for the leads.invoice_*
// data model, shared by the persistent Invoice Details section (per-field
// autosave) and the Get Invoice Details intake modal (batch save). Presentation
// differs; the field set, seeding, auto-calcs, and persist shape do not, so there
// is never a second invoice model.
//
// Auto-population policy (deliberately narrow — never fabricate lease info):
//   • Property Name  → the lead's Top Pick property (strong).
//   • Everything else → the saved invoice_* value, or blank/manual.
//   • Lease Start Date is NEVER derived from the lead's move_date (that is only the
//     client's anticipated move date; the real lease start can differ).
//   • Base Rent is NEVER derived from the client's budget.

export const INVOICE_REBATE_TYPES = ["None", "Cash Rebate", "Free Movers", "Gift Card", "Other"] as const
export type InvoiceRebateType = (typeof INVOICE_REBATE_TYPES)[number]

// Client Incentive — the user-facing choices for the invoice_rebate_type column.
// This is a TERMINOLOGY layer only: the underlying stored values are preserved
// ("None" | "Cash Rebate" | "Free Movers"), so no schema/data migration is needed.
// "No Client Incentive" persists as the existing "None". Cash Rebate is the ONLY
// choice that creates a post-payment Send Rebate action; Free Movers is scheduled
// separately (post-lease, before move-in) and is NOT handled at payment time.
export const CLIENT_INCENTIVE_OPTIONS = [
  { value: "None", label: "No Client Incentive" },
  { value: "Cash Rebate", label: "Cash Rebate" },
  { value: "Free Movers", label: "Free Movers" },
] as const

// Text/number fields are edited as strings; booleans as booleans. The persist
// layer converts blanks → null (all columns are nullable — blank is allowed).
export type InvoiceForm = {
  // Property contact/context (who provided the info, or why they couldn't).
  invoice_contact_name: string
  invoice_contact_title: string
  invoice_notes: string
  // Lease details.
  invoice_property_name: string
  invoice_unit_number: string
  invoice_lease_start_date: string // "YYYY-MM-DD" (blank/manual — never from move_date)
  invoice_lease_term: string
  invoice_base_rent: string
  // Canonical property identity, from the Map's property search. Null for a
  // property typed by hand — an uncatalogued property must still be invoiceable.
  invoice_property_place_id: string
  invoice_property_canonical_key: string
  // Commission. Percentage and flat fee are ALTERNATIVE base structures, never
  // both: a property pays a percentage of rent OR a fixed fee. Bonus is additive
  // to whichever applies, and is a separate concept from a flat fee — "$500" in
  // one merged field could never be told apart afterwards.
  invoice_commission_pct: string
  invoice_flat_fee: string
  invoice_bonus: string
  invoice_broker_split_pct: string
  // Rebate.
  invoice_rebate_type: string
  invoice_rebate_amount: string
  // Ongoing status flags (NOT the action-completion trigger — Save completes the
  // Get Invoice Details action; invoice_submitted is reserved for future Send Invoice).
  invoice_submitted: boolean
  invoice_commission_paid: boolean
}

// Text/text-like columns persisted as strings (blank → null). invoice_lease_start_date
// is a "YYYY-MM-DD" string persisted verbatim (blank → null) — never derived.
const TEXT_COLUMNS: (keyof InvoiceForm)[] = [
  "invoice_contact_name",
  "invoice_contact_title",
  "invoice_notes",
  "invoice_property_name",
  "invoice_unit_number",
  "invoice_lease_start_date",
  "invoice_lease_term",
  "invoice_rebate_type",
  "invoice_property_place_id",
  "invoice_property_canonical_key",
]
// Numeric columns persisted as numbers (blank/NaN → null).
const NUMBER_COLUMNS: (keyof InvoiceForm)[] = [
  "invoice_base_rent",
  "invoice_commission_pct",
  "invoice_flat_fee",
  "invoice_bonus",
  "invoice_broker_split_pct",
  "invoice_rebate_amount",
]

const numStr = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(v))

/**
 * Seed the editable form from the lead's stored invoice_* values. Existing saved
 * values always populate (so editing previously-collected details shows them).
 * Property Name falls back to `autoPropertyName` (the Top Pick) ONLY when no
 * invoice_property_name was saved yet — no other field is ever auto-filled.
 */
export function seedInvoiceForm(lead: any, autoPropertyName?: string | null): InvoiceForm {
  return {
    invoice_contact_name: lead.invoice_contact_name ?? "",
    invoice_contact_title: lead.invoice_contact_title ?? "",
    invoice_notes: lead.invoice_notes ?? "",
    invoice_property_name: lead.invoice_property_name ?? (autoPropertyName ?? "") ?? "",
    invoice_unit_number: lead.invoice_unit_number ?? "",
    invoice_lease_start_date: (lead.invoice_lease_start_date ?? "").slice(0, 10),
    invoice_lease_term: lead.invoice_lease_term ?? "",
    invoice_base_rent: numStr(lead.invoice_base_rent),
    invoice_property_place_id: lead.invoice_property_place_id ?? "",
    invoice_property_canonical_key: lead.invoice_property_canonical_key ?? "",
    invoice_commission_pct: numStr(lead.invoice_commission_pct),
    invoice_flat_fee: numStr(lead.invoice_flat_fee),
    invoice_bonus: numStr(lead.invoice_bonus),
    invoice_broker_split_pct: numStr(lead.invoice_broker_split_pct),
    invoice_rebate_type: lead.invoice_rebate_type ?? "None",
    invoice_rebate_amount: numStr(lead.invoice_rebate_amount),
    invoice_submitted: !!lead.invoice_submitted,
    invoice_commission_paid: !!lead.invoice_commission_paid,
  }
}

/**
 * The lead's Top Pick property name — the ONLY strong auto-population. Resolves
 * leads.top_pick_favorite_id against the lead's favorites; null when none.
 */
export function autoInvoicePropertyName(lead: any, favorites: any[] = []): string | null {
  const topPickId = lead?.top_pick_favorite_id
  if (topPickId == null || String(topPickId) === "") return null
  const fav = (favorites || []).find((f: any) => String(f.id) === String(topPickId))
  const name = (fav?.property_name || fav?.property_address || "").toString().trim()
  return name || null
}

/**
 * The invoice totals.
 *
 *   base commission = flat fee            when a flat fee is entered
 *                   = base rent × pct/100 otherwise
 *   TOTAL           = base commission + bonus
 *   EXPECTED        = TOTAL × broker split / 100
 *
 * Percentage and flat fee are ALTERNATIVES, not addends — a property pays a
 * percentage of rent OR a fixed fee per lease. The flat fee wins when both are
 * somehow present: it is an explicit dollar amount the locator typed, where a
 * stale percentage may just be left over from the other structure.
 *
 * Bonus is INSIDE the broker split by decision: it is money the property paid on
 * this lease, so the brokerage splits it like the rest. (If bonuses ever pay
 * through to the agent whole, this is the one line that changes:
 * expected = (total - bonus) × split/100 + bonus.)
 *
 * Still computed live for the UI — but now also PERSISTED at save time, so a
 * historical invoice keeps the number that was actually billed even if the inputs
 * or this formula change later. Same reason closed_estimated_commission is frozen.
 */
export function computeInvoiceTotals(
  form: Pick<InvoiceForm, "invoice_base_rent" | "invoice_commission_pct" | "invoice_broker_split_pct" | "invoice_flat_fee" | "invoice_bonus">,
): { totalInvoice: number | null; expectedCommission: number | null } {
  // Strip any presentation ($ , %) first so totals are identical whether the caller
  // passes raw digits or formatted display strings (formatting is presentation-only).
  const num = (v: string | undefined) => {
    const n = parseFloat(rawNumericString(v ?? ""))
    return Number.isNaN(n) ? null : n
  }
  const base = num(form.invoice_base_rent)
  const pct = num(form.invoice_commission_pct)
  const flat = num(form.invoice_flat_fee)
  const bonus = num(form.invoice_bonus)
  const broker = num(form.invoice_broker_split_pct)

  const baseCommission = flat !== null ? flat : base !== null && pct !== null ? (base * pct) / 100 : null

  // A bonus with no base structure is still a real invoice — some leases pay only
  // a lease-up bonus — so the total is not gated on a base commission existing.
  const totalInvoice =
    baseCommission === null && bonus === null ? null : (baseCommission ?? 0) + (bonus ?? 0)

  const expectedCommission =
    totalInvoice !== null && broker !== null ? (totalInvoice * broker) / 100 : null
  return { totalInvoice, expectedCommission }
}

export function formatInvoiceCurrency(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// ── Presentation-only input formatters (numeric persistence is unchanged) ──────
// Money/percent inputs let the agent type a RAW number, then format at rest (on
// blur) — "$1,200" / "100%" — reverting to the raw digits while editing so we never
// fight the user mid-type. The stored form value + buildInvoicePatch stay numeric.

/** Strip presentation ($ , %) to the raw numeric string for editing/persist. */
export function rawNumericString(raw: unknown): string {
  const s = String(raw ?? "").trim()
  return s === "" ? "" : s.replace(/[^0-9.\-]/g, "")
}

/** Display a money value as "$1,200" (blank stays blank; non-numeric passes through). */
export function formatMoneyDisplay(raw: unknown): string {
  const s = String(raw ?? "").trim()
  if (s === "") return ""
  const n = Number(rawNumericString(s))
  return Number.isNaN(n) ? s : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

/** Display a percentage as "100%" (blank stays blank; non-numeric passes through). */
export function formatPercentDisplay(raw: unknown): string {
  const s = String(raw ?? "").trim()
  if (s === "") return ""
  const n = Number(rawNumericString(s))
  return Number.isNaN(n) ? s : `${n}%`
}

/**
 * Build the leads UPDATE patch for the full invoice_* set from the form. Blank
 * text → null; blank/NaN number → null (all columns nullable — blank is allowed,
 * so an agent who could not obtain lease info can still save contact + notes).
 * Boolean flags are passed through. Used by the modal's single batch Save.
 */
export function buildInvoicePatch(form: InvoiceForm): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const col of TEXT_COLUMNS) {
    const v = String(form[col] ?? "").trim()
    patch[col] = v || null
  }
  for (const col of NUMBER_COLUMNS) {
    // Strip any presentation ($ , %) so persistence is always raw numeric.
    const raw = rawNumericString(form[col])
    if (raw === "") {
      patch[col] = null
    } else {
      const n = Number(raw)
      patch[col] = Number.isNaN(n) ? null : n
    }
  }
  patch.invoice_submitted = !!form.invoice_submitted
  patch.invoice_commission_paid = !!form.invoice_commission_paid

  // FREEZE the financial snapshot at save time. These two were previously derived
  // on every render and never stored, which is fine for a live form and wrong for a
  // historical record: an invoice must keep the number that was actually billed
  // even if the inputs, the broker split, or this formula change afterwards. Same
  // reasoning as closed_estimated_commission being frozen on close.
  const { totalInvoice, expectedCommission } = computeInvoiceTotals(form)
  patch.invoice_total_amount = totalInvoice
  patch.invoice_expected_commission = expectedCommission
  return patch
}
