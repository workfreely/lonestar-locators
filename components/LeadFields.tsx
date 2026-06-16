"use client"

import { useState } from "react"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import { formatPhone } from "@/lib/utils/formatPhone"
import {
  CITIES,
  PROPERTY_TYPES,
  BED_OPTIONS,
  CREDIT_HISTORY_OPTIONS,
  HISTORY_AGE_OPTIONS,
  BALANCE_OPTIONS,
  CRIMINAL_BACKGROUND_OPTIONS,
  CRIMINAL_CHARGE_OPTIONS,
  RENT_RANGE_OPTIONS,
} from "@/lib/formOptions"

// ─── Shared style tokens ──────────────────────────────────────────────────────

const inputCls = [
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800",
  "placeholder-gray-400 bg-white",
  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
  "transition-shadow",
].join(" ")

const selectCls = inputCls + " cursor-pointer"
const sectionLabelCls = "text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2.5 block"

// ─── Internal layout helpers ──────────────────────────────────────────────────

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={sectionLabelCls}>{title}</p>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function Full({ children }: { children: React.ReactNode }) {
  return <div className="col-span-2">{children}</div>
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeadFields({
  form,
  updateField,
}: {
  form: any
  updateField: (key: string, value: string) => void
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const creditHistory  = form.credit_history      || ""
  const criminal       = form.criminal_background  || ""
  const hasBrokenLease = creditHistory === "Broken Lease"
  const hasEviction    = creditHistory === "Eviction"

  return (
    <div className="space-y-6">

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
          onChange={e => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 10)
            updateField("phone", formatPhone(digits))
          }}
        />
        <input
          className={inputCls}
          type="email"
          placeholder="Email"
          value={form.email || ""}
          onChange={e => updateField("email", e.target.value)}
        />
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
        <input
          className={inputCls}
          placeholder="Instagram handle"
          value={form.instagram || ""}
          onChange={e => updateField("instagram", e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="TikTok handle"
          value={form.tiktok || ""}
          onChange={e => updateField("tiktok", e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="Facebook name"
          value={form.facebook || ""}
          onChange={e => updateField("facebook", e.target.value)}
        />
      </Group>

      {/* ── Move Details ─────────────────────────────────────────────────── */}
      <Group title="Move Details">
        <select
          className={selectCls}
          value={form.city || ""}
          onChange={e => updateField("city", e.target.value)}
        >
          <option value="">City *</option>
          {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

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
            <option value="">Monthly Budget</option>
            {RENT_RANGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Full>
      </Group>

      {/* ── Screening ────────────────────────────────────────────────────── */}
      <Group title="Screening">
        <input
          className={inputCls}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Credit Score (300–850)"
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

        <Full>
          <textarea
            className={inputCls + " resize-none h-20"}
            placeholder="Client notes..."
            value={form.notes || ""}
            onChange={e => updateField("notes", e.target.value)}
          />
        </Full>
      </Group>

      {/* ── Additional Screening (collapsible) ───────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          className="flex items-center gap-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors"
        >
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none"
            className={`transition-transform duration-200 ${showAdvanced ? "rotate-90" : ""}`}
          >
            <path d="M3 1.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Additional Screening Details
        </button>

        {showAdvanced && (
          <div className="mt-4 pl-3 border-l-2 border-gray-100 space-y-5">

            {/* Broken Lease sub-fields — only when Broken Lease selected */}
            {hasBrokenLease && (
              <Group title="Broken Lease">
                <select
                  className={selectCls}
                  value={form.broken_lease_age || ""}
                  onChange={e => updateField("broken_lease_age", e.target.value)}
                >
                  <option value="">How old is the broken lease?</option>
                  {HISTORY_AGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <select
                  className={selectCls}
                  value={form.broken_lease_amount || ""}
                  onChange={e => updateField("broken_lease_amount", e.target.value)}
                >
                  <option value="">Balance owed</option>
                  {BALANCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Group>
            )}

            {/* Eviction sub-fields — only when Eviction selected */}
            {hasEviction && (
              <Group title="Eviction">
                <select
                  className={selectCls}
                  value={form.eviction_court || ""}
                  onChange={e => updateField("eviction_court", e.target.value)}
                >
                  <option value="">Did it go to court?</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
                <select
                  className={selectCls}
                  value={form.eviction_age || ""}
                  onChange={e => updateField("eviction_age", e.target.value)}
                >
                  <option value="">How old is the eviction?</option>
                  {HISTORY_AGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <select
                  className={selectCls}
                  value={form.eviction_balance || ""}
                  onChange={e => updateField("eviction_balance", e.target.value)}
                >
                  <option value="">Balance owed</option>
                  {BALANCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Group>
            )}

            {/* Criminal Background */}
            <Group title="Criminal Background">
              <select
                className={selectCls}
                value={form.criminal_background || ""}
                onChange={e => updateField("criminal_background", e.target.value)}
              >
                <option value="">Select Criminal Background</option>
                {CRIMINAL_BACKGROUND_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              {criminal && criminal !== "None" && (
                <select
                  className={selectCls}
                  value={form.criminal_charge || ""}
                  onChange={e => updateField("criminal_charge", e.target.value)}
                >
                  <option value="">Charge type</option>
                  {CRIMINAL_CHARGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )}

              {criminal === "Felony" && (
                <select
                  className={selectCls}
                  value={form.felony_age || ""}
                  onChange={e => updateField("felony_age", e.target.value)}
                >
                  <option value="">How old is the felony?</option>
                  {HISTORY_AGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )}

              {criminal === "Misdemeanor" && (
                <select
                  className={selectCls}
                  value={form.misdemeanor_age || ""}
                  onChange={e => updateField("misdemeanor_age", e.target.value)}
                >
                  <option value="">How old is the misdemeanor?</option>
                  {HISTORY_AGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
            </Group>

            {/* Locator Notes */}
            <div>
              <p className={sectionLabelCls}>Locator Notes</p>
              <textarea
                className={inputCls + " resize-none h-20"}
                placeholder="Internal notes (not visible to client)..."
                value={form.locator_notes || ""}
                onChange={e => updateField("locator_notes", e.target.value)}
              />
            </div>

          </div>
        )}
      </div>

    </div>
  )
}
