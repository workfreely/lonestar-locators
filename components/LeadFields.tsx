"use client"

import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import { formatPhoneInput } from "@/lib/utils/formatPhone"
import {
  CITIES,
  PROPERTY_TYPES,
  BED_OPTIONS,
  CREDIT_HISTORY_OPTIONS,
  CRIMINAL_BACKGROUND_OPTIONS,
  RENT_RANGE_OPTIONS,
} from "@/lib/formOptions"
import { MUST_HAVE_AMENITIES, MAX_MUST_HAVE_AMENITIES, normalizeMustHaveAmenities } from "@bc/companion-shared"

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
  const selected = normalizeMustHaveAmenities(value.split(","))
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeadFields({
  form,
  updateField,
}: {
  form: any
  updateField: (key: string, value: string) => void
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
          selected={form.move_date ? new Date(form.move_date + "T12:00:00") : null}
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

      {/* ── Property Preferences ─────────────────────────────────────────── */}
      <Group title="Property Preferences">
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

        <Full>
          <select
            className={selectCls}
            value={form.desired_rent || ""}
            onChange={e => updateField("desired_rent", e.target.value)}
          >
            <option value="">Budget</option>
            {RENT_RANGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Full>

        {/* Must-Have Amenities — the SAME canonical option list and max-3 rule as the
            Smart Form. Stored comma-joined (canonical values, not labels), so a lead
            created manually or with the form field hidden can still be given must-haves
            here, and existing selections can be added/removed later. */}
        <Full className="mt-2">
          <MustHaveAmenities value={form.must_have_amenities || ""} onChange={v => updateField("must_have_amenities", v)} />
        </Full>
      </Group>

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

      {/* ── Lead Source — last. Same required rule and same options as before. */}
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

    </div>
  )
}
