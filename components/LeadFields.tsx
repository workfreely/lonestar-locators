"use client"

import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import { formatPhoneInput } from "@/lib/utils/formatPhone"
import {
  CITIES,
  PROPERTY_TYPES,
  BED_OPTIONS,
  BATH_OPTIONS,
  CREDIT_HISTORY_OPTIONS,
  CRIMINAL_BACKGROUND_OPTIONS,
  CRIMINAL_CHARGE_OPTIONS,
  HISTORY_AGE_OPTIONS,
  BALANCE_OPTIONS,
  INCOME_OPTIONS,
  RENT_RANGE_OPTIONS,
  MAX_LOCATIONS,
} from "@/lib/formOptions"
import { getMarketByName } from "@/lib/markets/catalog"
import { MUST_HAVE_AMENITIES, MAX_MUST_HAVE_AMENITIES, normalizeMustHaveAmenities } from "@bc/companion-shared"
import { parseMoveDate, csvToArr, arrToCsv } from "@/lib/leads/leadFormValues"

// ─── Shared style tokens ──────────────────────────────────────────────────────

const inputCls = [
  "w-full border border-[var(--crm-border)] rounded-lg px-3 py-2 text-sm text-[var(--crm-text-primary)]",
  "placeholder-[var(--crm-text-muted)] bg-[var(--crm-inset)]",
  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
  "transition-shadow",
].join(" ")

const selectCls = inputCls + " cursor-pointer"
const sectionLabelCls = "text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-2.5 block"

// ─── Internal layout helpers ──────────────────────────────────────────────────

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={sectionLabelCls}>{title}</p>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function Full({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`col-span-2 ${className}`}>{children}</div>
}

/** Max-3 must-have picker over the canonical option list. Reads/writes the stored
 *  comma-joined string of canonical VALUES. At the cap, selecting more is refused while
 *  deselecting stays available so a locator can always swap one for another. */
function MustHaveAmenities({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  // Tolerant of a null / numeric / legacy-array stored value (csvToArr coerces).
  const selected = normalizeMustHaveAmenities(csvToArr(value))
  function toggle(v: string) {
    const has = selected.includes(v as (typeof selected)[number])
    if (!has && selected.length >= MAX_MUST_HAVE_AMENITIES) return
    const next = has ? selected.filter(x => x !== v) : [...selected, v]
    onChange(normalizeMustHaveAmenities(next).join(", "))
  }
  return (
    <div>
      <p className="text-[11px] text-[var(--crm-text-muted)] mb-1.5">Must-Have Amenities — select up to 3</p>
      <div className="flex flex-wrap gap-1.5">
        {MUST_HAVE_AMENITIES.map(a => {
          const on = selected.includes(a.value)
          const atCap = !on && selected.length >= MAX_MUST_HAVE_AMENITIES
          return (
            <button
              key={a.value}
              type="button"
              onClick={() => toggle(a.value)}
              disabled={atCap}
              className={[
                "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                on
                  ? "border-transparent bg-blue-600 text-white"
                  : "border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-primary)]",
                atCap ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
              ].join(" ")}
            >
              {a.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// The stored neighborhoods/submarkets columns are comma-joined strings; the picker
// works in arrays and joins back with the SAME ", " the public form + submit use.
// csvToArr / arrToCsv are the shared tolerant helpers (lib/leads/leadFormValues).

/**
 * Preferred Neighborhoods + Nearby Areas — the SAME catalog-driven options and the
 * SAME COMBINED max-3 rule as the public Smart Lead Form (MAX_LOCATIONS is shared).
 * Options come from the selected city's market (getMarketByName), split into the
 * market's `neighborhoods` (Preferred) and `submarkets` (Nearby). The Preferred vs
 * Nearby SPLIT is preserved: each writes back to its own CSV column. At the combined
 * cap, adding is refused while removing stays available (swap one for another). Chip
 * styling mirrors Must-Have Amenities so the modal's look is unchanged.
 */
function LocationPicker({
  city,
  neighborhoods,
  submarkets,
  updateField,
}: {
  city: string
  neighborhoods: string
  submarkets: string
  updateField: (key: string, value: string) => void
}) {
  const market = getMarketByName(city)
  const nbhdOpts = market?.neighborhoods ?? []
  const subOpts = market?.submarkets ?? []
  const nbhds = csvToArr(neighborhoods)
  const subs = csvToArr(submarkets)
  const atCap = nbhds.length + subs.length >= MAX_LOCATIONS

  // No city (or a market with no neighborhood list) → no picker, exactly like the
  // public form, which renders the areas only once a city is chosen.
  if (!city || nbhdOpts.length === 0) return null

  function toggle(list: string[], key: "neighborhoods" | "submarkets", v: string) {
    const has = list.includes(v)
    if (!has && atCap) return
    updateField(key, arrToCsv(has ? list.filter((x) => x !== v) : [...list, v]))
  }

  const Chips = ({ options, list, keyName }: { options: readonly string[]; list: string[]; keyName: "neighborhoods" | "submarkets" }) => {
    // Stored values NOT in this market's current catalog. They already count
    // toward the max-3 total (via csvToArr length), so render them as selected,
    // removable chips instead of leaving them invisible-but-counted. Clicking one
    // removes it — freeing a slot for a catalog area. We never map or rename them.
    const legacy = list.filter((v) => !options.includes(v))
    return (
      <div className="flex flex-wrap gap-1.5">
        {options.map((v) => {
          const on = list.includes(v)
          const disabled = !on && atCap
          return (
            <button
              key={v}
              type="button"
              onClick={() => toggle(list, keyName, v)}
              disabled={disabled}
              className={[
                "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                on
                  ? "border-transparent bg-blue-600 text-white"
                  : "border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-primary)]",
                disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
              ].join(" ")}
            >
              {v}
            </button>
          )
        })}
        {legacy.map((v) => (
          // Selected (counts toward the cap) but off-catalog — a dashed ring hints
          // it isn't in the current list. Click to remove and free its slot.
          <button
            key={`legacy-${v}`}
            type="button"
            onClick={() => toggle(list, keyName, v)}
            title="Not in this market's current area list — click to remove and free a slot"
            className="rounded-full border border-dashed border-blue-300 bg-blue-600 px-2.5 py-1 text-[12px] text-white transition-colors cursor-pointer"
          >
            {v}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] text-[var(--crm-text-muted)] mb-1.5">Preferred Neighborhoods — up to 3 total (with Nearby Areas)</p>
        <Chips options={nbhdOpts} list={nbhds} keyName="neighborhoods" />
      </div>
      {(subOpts.length > 0 || subs.length > 0) && (
        <div>
          <p className="text-[11px] text-[var(--crm-text-muted)] mb-1.5">Nearby Areas</p>
          <Chips options={subOpts} list={subs} keyName="submarkets" />
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeadFields({
  form,
  updateField,
  hideSource = false,
}: {
  form: any
  updateField: (key: string, value: string) => void
  /** Edit Client hides the Lead Source control — source is intake attribution, not a
   *  client-criteria field, and isn't part of the edit save. */
  hideSource?: boolean
}) {
  return (
    <div className="space-y-6">

      {/* Section order mirrors how a locator actually takes a lead: who they
          are → when/where → what they want → whether they'll qualify → notes →
          where they came from. Must-Have Amenities deliberately comes AFTER
          Property Type, Bedrooms and Budget so it never splits the core
          property criteria. */}

      {/* ── Contact ─────────────────────────────────────────────────────── */}
      <Group title="Contact">
        <input
          className={inputCls}
          placeholder="First Name *"
          value={form.first_name || ""}
          onChange={e => updateField("first_name", e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="Last Name *"
          value={form.last_name || ""}
          onChange={e => updateField("last_name", e.target.value)}
        />
        <input
          className={inputCls}
          type="tel"
          placeholder="Phone *"
          value={form.phone || ""}
          maxLength={14}
          autoComplete="tel"
          onChange={e => updateField("phone", formatPhoneInput(e.target.value))}
        />
        <input
          className={inputCls}
          type="email"
          placeholder="Email"
          value={form.email || ""}
          onChange={e => updateField("email", e.target.value)}
        />
      </Group>

      {/* ── Move Details ─────────────────────────────────────────────────── */}
      <Group title="Move Details">
        {/* react-datepicker — wrapper gets display:block;width:100% from globals.css */}
        <DatePicker
          selected={parseMoveDate(form.move_date)}
          onChange={(date: Date | null) =>
            updateField("move_date", date ? date.toISOString().split("T")[0] : "")
          }
          placeholderText="Move-In Date"
          dateFormat="MM/dd/yyyy"
          className={inputCls}
          autoComplete="off"
        />

        <select
          className={selectCls}
          value={form.city || ""}
          onChange={e => updateField("city", e.target.value)}
          required
        >
          <option value="">City *</option>
          {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </Group>

      {/* ── Preferred Locations ──────────────────────────────────────────────
             Preferred Neighborhoods + Nearby Areas, catalog-driven per the chosen
             city, sharing ONE combined max-3 rule. Renders only once a city with a
             neighborhood list is selected (mirrors the public form). */}
      {(() => {
        const market = getMarketByName(form.city || "")
        if (!form.city || !market || market.neighborhoods.length === 0) return null
        return (
          <div>
            <p className={sectionLabelCls}>Preferred Locations</p>
            <LocationPicker
              city={form.city}
              neighborhoods={form.neighborhoods || ""}
              submarkets={form.submarkets || ""}
              updateField={updateField}
            />
          </div>
        )
      })()}

      {/* ── Property Preferences ──────────────────────────────────────────────
             Row 1 (3 cols): Property Type · Bedrooms · Bathrooms
             Row 2 (2 cols): Monthly Income · Budget
             Must-Have Amenities spans full width below. Custom grid (not the shared
             2-col Group) so the row shapes match the approved layout; same label
             style and controls as before. */}
      <div>
        <p className={sectionLabelCls}>Property Preferences</p>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <select
              className={selectCls}
              value={form.property_type || ""}
              onChange={e => updateField("property_type", e.target.value)}
            >
              <option value="">Property Type</option>
              {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <select
              className={selectCls}
              value={form.beds || ""}
              onChange={e => updateField("beds", e.target.value)}
            >
              <option value="">Bedrooms</option>
              {BED_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <select
              className={selectCls}
              value={form.baths || ""}
              onChange={e => updateField("baths", e.target.value)}
            >
              <option value="">Bathrooms</option>
              {BATH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <select
              className={selectCls}
              value={form.income || ""}
              onChange={e => updateField("income", e.target.value)}
            >
              <option value="">Monthly Income</option>
              {INCOME_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>

            <select
              className={selectCls}
              value={form.desired_rent || ""}
              onChange={e => updateField("desired_rent", e.target.value)}
            >
              <option value="">Budget</option>
              {RENT_RANGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Must-Have Amenities — the SAME canonical option list and max-3 rule as
              the Smart Form. Stored comma-joined (canonical values, not labels). */}
          <div className="mt-1">
            <MustHaveAmenities value={form.must_have_amenities || ""} onChange={v => updateField("must_have_amenities", v)} />
          </div>
        </div>
      </div>

      {/* ── Screening — Credit Score (compact) + Rental & Criminal Background
             in one row. Detailed screening sub-fields come from the Smart Lead
             Form, not this quick manual add. */}
      <Group title="Screening">
        <Full>
          <div className="grid grid-cols-[120px_1fr_1fr] gap-3">
            <input
              className={inputCls}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Credit Score"
              value={form.credit_score || ""}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, "")
                if (v === "") { updateField("credit_score", ""); return }
                if (v.length <= 3) updateField("credit_score", v)
              }}
              onBlur={e => {
                const n = Number(e.target.value)
                if (e.target.value && (n < 300 || n > 850)) updateField("credit_score", "")
              }}
            />
            <select
              className={selectCls}
              value={form.credit_history || ""}
              onChange={e => updateField("credit_history", e.target.value)}
            >
              <option value="">Rental Background</option>
              {CREDIT_HISTORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              className={selectCls}
              value={form.criminal_background || ""}
              onChange={e => updateField("criminal_background", e.target.value)}
            >
              <option value="">Criminal Background</option>
              {CRIMINAL_BACKGROUND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </Full>

        {/* Broken-lease follow-ups — same trigger + options as the Smart Lead Form. */}
        {form.credit_history === "Broken Lease" && (
          <Full>
            <div className="grid grid-cols-2 gap-3">
              <select className={selectCls} value={form.broken_lease_age || ""} onChange={e => updateField("broken_lease_age", e.target.value)}>
                <option value="">How old is the broken lease?</option>
                {HISTORY_AGE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className={selectCls} value={form.broken_lease_amount || ""} onChange={e => updateField("broken_lease_amount", e.target.value)}>
                <option value="">Approximate balance owed</option>
                {BALANCE_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </Full>
        )}

        {/* Eviction follow-ups. */}
        {form.credit_history === "Eviction" && (
          <Full>
            <div className="grid grid-cols-3 gap-3">
              <select className={selectCls} value={form.eviction_court || ""} onChange={e => updateField("eviction_court", e.target.value)}>
                <option value="">Went to court?</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
              <select className={selectCls} value={form.eviction_age || ""} onChange={e => updateField("eviction_age", e.target.value)}>
                <option value="">How old is the eviction?</option>
                {HISTORY_AGE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className={selectCls} value={form.eviction_balance || ""} onChange={e => updateField("eviction_balance", e.target.value)}>
                <option value="">Approximate balance owed</option>
                {BALANCE_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </Full>
        )}

        {/* Criminal follow-ups — charge type for any non-None record, plus the age
            for the matching classification. Same triggers/options as the Smart Form. */}
        {form.criminal_background && form.criminal_background !== "None" && (
          <Full>
            <div className="grid grid-cols-2 gap-3">
              <select className={selectCls} value={form.criminal_charge || ""} onChange={e => updateField("criminal_charge", e.target.value)}>
                <option value="">Charge type</option>
                {CRIMINAL_CHARGE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {form.criminal_background === "Felony" && (
                <select className={selectCls} value={form.felony_age || ""} onChange={e => updateField("felony_age", e.target.value)}>
                  <option value="">How old is the felony?</option>
                  {HISTORY_AGE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
              {form.criminal_background === "Misdemeanor" && (
                <select className={selectCls} value={form.misdemeanor_age || ""} onChange={e => updateField("misdemeanor_age", e.target.value)}>
                  <option value="">How old is the misdemeanor?</option>
                  {HISTORY_AGE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
            </div>
          </Full>
        )}
      </Group>

      {/* ── Notes — no group heading: "Client Notes" and "Locator Notes" already
             label themselves, so the extra "Notes" title was a redundant level.
             Same wrapper Group renders, minus its title paragraph. ── */}
      <div>
        <div className="grid grid-cols-2 gap-3">
        <Full>
          <p className={sectionLabelCls}>Client Notes</p>
          <textarea
            className={inputCls + " resize-none h-20"}
            placeholder="Client notes..."
            value={form.notes || ""}
            onChange={e => updateField("notes", e.target.value)}
          />
        </Full>

        <Full>
          <p className={sectionLabelCls}>Locator Notes</p>
          <textarea
            className={inputCls + " resize-none h-20"}
            placeholder="Internal notes (not visible to client)..."
            value={form.locator_notes || ""}
            onChange={e => updateField("locator_notes", e.target.value)}
          />
        </Full>
        </div>
      </div>

      {/* ── Lead Source — last. Same required rule and same options as before.
             Hidden in Edit Client (source is intake attribution, not edited here). */}
      {!hideSource && (
      <Group title="Lead Source">
        <Full>
          <select
            className={selectCls}
            value={form.source || ""}
            onChange={e => updateField("source", e.target.value)}
            required
          >
            <option value="">Lead Source *</option>
            <option value="website">Website</option>
            <option value="tiktok">TikTok</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
            <option value="referral">Referral</option>
          </select>
        </Full>
      </Group>
      )}

    </div>
  )
}
