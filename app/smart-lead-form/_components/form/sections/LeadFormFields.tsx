"use client"

import { useState } from "react"
import type { SmartLeadFormConfig } from "../../../_lib/types"
import {
  PROPERTY_TYPES,
  BED_OPTIONS,
  CREDIT_HISTORY_OPTIONS,
  HISTORY_AGE_OPTIONS,
  BALANCE_OPTIONS,
  CRIMINAL_BACKGROUND_OPTIONS,
  CRIMINAL_CHARGE_OPTIONS,
  RENT_RANGE_OPTIONS,
} from "@/lib/formOptions"

// ─────────────────────────────────────────────────────────────────────────────
// Fields, conditional logic, and validation are ported 1:1 from LandingForm.tsx
// (the source of truth) — same field names, options, and rules — restyled with
// the Smart Lead Form's own light input styling. Only the form portion of the
// page is affected; Hero / agent / testimonials / FAQ / footer are untouched.
//
// This is the builder preview, so on submit it shows the confirmation state
// rather than posting a lead (unchanged from before).
// ─────────────────────────────────────────────────────────────────────────────

// Per-city neighborhoods — copied verbatim from LandingForm.tsx.
const cityNeighborhoods: Record<string, string[]> = {
  Austin: [
    "All of Austin", "Downtown Austin", "South Congress (SoCo)", "East Austin", "Zilker",
    "Mueller", "Domain", "Barton Creek", "Westlake", "Riverside", "North Loop", "South Lamar",
  ],
  Dallas: [
    "All of Dallas", "Downtown Dallas", "Uptown", "Midtown", "Deep Ellum", "Medical District",
    "Bishop Arts District", "Knox-Henderson", "Oak Lawn", "Design District", "Victory Park",
    "Lower Greenville", "Trinity Groves", "South Dallas",
  ],
  Houston: [
    "All of Houston", "Downtown Houston", "Midtown", "Montrose", "The Heights", "Medical Center",
    "Museum District", "River Oaks", "Galleria", "Washington Ave", "East Downtown (EaDo)",
    "Greenway / Upper Kirby",
  ],
  "San Antonio": [
    "All of San Antonio", "Downtown San Antonio", "La Cantera/The Rim", "The Dominion", "Stone Oak",
    "Alamo Ranch", "Southtown", "UTSA", "Medical Center", "Universal City/Converse",
    "Westover Hills", "Alamo Heights",
  ],
}

const SA_SUBMARKETS = ["New Braunfels", "Boerne", "Schertz", "San Marcos"]

// Shared styling (matches the existing Smart Lead Form light form aesthetic).
const inputClass =
  "w-full rounded-xl border border-[#e2e4ea] bg-white px-4 py-3.5 text-[15px] text-[#111318] outline-none transition-colors focus:border-[#2f6bff]"
const labelClass = "text-[13px] font-medium text-[#4b5162]"
const noteClass = "mt-1.5 text-[12.5px] leading-relaxed text-[#6b7280]"

type FormData = {
  firstName: string
  lastName: string
  phone: string
  email: string
  moveDate: string
  city: string
  neighborhoods: string[]
  submarkets: string[]
  propertyType: string
  desiredRent: string
  beds: string
  baths: string
  creditScore: string
  creditHistory: string
  brokenLeaseAge: string
  brokenLeaseAmount: string
  evictionCourt: string
  evictionAge: string
  evictionBalance: string
  criminalBackground: string
  criminalCharge: string
  felonyAge: string
  misdemeanorAge: string
  notes: string
  website: string // honeypot
  sms_consent: boolean
}

const INITIAL: FormData = {
  firstName: "", lastName: "", phone: "", email: "", moveDate: "", city: "",
  neighborhoods: [], submarkets: [], propertyType: "", desiredRent: "", beds: "", baths: "",
  creditScore: "", creditHistory: "", brokenLeaseAge: "", brokenLeaseAmount: "",
  evictionCourt: "", evictionAge: "", evictionBalance: "", criminalBackground: "",
  criminalCharge: "", felonyAge: "", misdemeanorAge: "", notes: "", website: "", sms_consent: false,
}

export default function LeadFormFields({ config }: { config: SmartLeadFormConfig }) {
  const [formData, setFormData] = useState<FormData>(INITIAL)
  const [submitted, setSubmitted] = useState(false)

  const { buttonColor } = config.branding
  const { enabled: consentEnabled, text: consentText } = config.consent

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  // Phone mask — identical rules to LandingForm (area code can't start 0/1).
  function handlePhone(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.replace(/\D/g, "")
    if (value.length >= 3) {
      const areaCode = value.slice(0, 3)
      if (areaCode[0] === "0" || areaCode[0] === "1") return
    }
    const formatted =
      value.length <= 3
        ? value
        : value.length <= 6
        ? `(${value.slice(0, 3)}) ${value.slice(3)}`
        : `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 10)}`
    set("phone", formatted)
  }

  // Credit score — same 300–850 guard as LandingForm.
  function handleCreditScore(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    if (value === "") return set("creditScore", "")
    if (value.length > 3) return
    if (value.length < 3) return set("creditScore", value)
    const num = Number(value)
    if (num >= 300 && num <= 850) set("creditScore", value)
  }

  // Property type → beds/baths cascade (identical to LandingForm).
  function handlePropertyType(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value
    let newBeds = ""
    let newBaths = ""
    if (value === "Rental Home") {
      newBeds = "3+"
      newBaths = "2"
    }
    setFormData((prev) => ({ ...prev, propertyType: value, beds: newBeds, baths: newBaths }))
  }

  // Beds → baths cascade (identical to LandingForm).
  function handleBeds(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value
    let newBaths = ""
    if (formData.propertyType === "Rental Home") newBaths = "2"
    else if (value === "1") newBaths = "1"
    else if (value === "2") newBaths = "2"
    else if (value === "3+") newBaths = "2"
    setFormData((prev) => ({ ...prev, beds: value, baths: newBaths }))
  }

  // Neighborhood toggle with the "All of {city}" logic from LandingForm.
  function toggleNeighborhood(checked: boolean, value: string) {
    setFormData((prev) => {
      const all = cityNeighborhoods[prev.city] || []
      let updated = [...prev.neighborhoods]
      if (value.startsWith("All of")) {
        updated = checked ? [...all] : []
      } else {
        updated = checked ? [...updated, value] : updated.filter((n) => n !== value)
        if (updated.length === all.length - 1 && !updated.includes(`All of ${prev.city}`)) {
          updated = [...all]
        } else if (updated.includes(`All of ${prev.city}`) && updated.length !== all.length) {
          updated = updated.filter((n) => n !== `All of ${prev.city}`)
        }
      }
      return { ...prev, neighborhoods: updated }
    })
  }

  function toggleSubmarket(checked: boolean, value: string) {
    setFormData((prev) => {
      const updated = checked
        ? [...prev.submarkets, value]
        : prev.submarkets.filter((s) => s !== value)
      return { ...prev, submarkets: updated }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // ─── Validation — ported from LandingForm ───
    if (!formData.moveDate) return alert("Please select your move date.")
    if (formData.neighborhoods.length === 0)
      return alert("Please select at least one preferred neighborhood.")
    if (
      formData.creditHistory === "Broken Lease" &&
      (!formData.brokenLeaseAge || !formData.brokenLeaseAmount)
    )
      return alert("Please complete the broken lease details.")
    if (
      formData.creditHistory === "Eviction" &&
      (!formData.evictionAge || !formData.evictionBalance)
    )
      return alert("Please complete the eviction details.")

    // Honeypot — silently ignore bot submissions.
    if (formData.website) return

    // Builder preview — confirm rather than post (unchanged behavior).
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <section className="px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-lg rounded-2xl border border-[#e2e4ea] bg-[#f7f8fa] p-8 text-center">
          <p className="text-[18px] font-semibold text-[#111318]">You&apos;re all set.</p>
          <p className="mt-2 text-[14px] text-[#6b7280]">
            This is a preview — nothing was actually submitted.
          </p>
        </div>
      </section>
    )
  }

  const neighborhoodList = formData.city ? cityNeighborhoods[formData.city] : null

  return (
    <section className="px-5 py-8 sm:px-8" id="smart-lead-form">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-lg flex-col gap-4 rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] sm:p-7"
      >
        {/* First / Last name */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>First Name</label>
          <input name="firstName" value={formData.firstName} onChange={handleChange} required autoComplete="given-name" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Last Name</label>
          <input name="lastName" value={formData.lastName} onChange={handleChange} required autoComplete="family-name" className={inputClass} />
        </div>

        {/* Phone */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Phone Number</label>
          <input type="tel" name="phone" value={formData.phone} onChange={handlePhone} maxLength={14} required autoComplete="tel" className={inputClass} />
          {formData.phone.replace(/\D/g, "").length >= 3 &&
            (formData.phone.replace(/\D/g, "")[0] === "0" || formData.phone.replace(/\D/g, "")[0] === "1") && (
              <div className={noteClass}>Please enter a valid US phone number.</div>
            )}
        </div>

        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Email</label>
          <input type="email" name="email" value={formData.email} onChange={handleChange} required autoComplete="email" className={inputClass} />
        </div>

        {/* Move-in date */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Desired Move-In Date</label>
          <input type="date" name="moveDate" value={formData.moveDate} onChange={handleChange} required className={`${inputClass} slf-date-input cursor-pointer`} />
        </div>

        {/* City */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>City</label>
          <select name="city" value={formData.city} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
            <option value="">Select City</option>
            {Object.keys(cityNeighborhoods).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Neighborhoods */}
        {neighborhoodList && (
          <div className="flex flex-col gap-2">
            <label className={`${labelClass} font-semibold`}>Preferred Neighborhoods</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => set("neighborhoods", [...neighborhoodList])}
                className="rounded-lg border border-[#e2e4ea] bg-[#f7f8fa] px-3 py-1.5 text-[12.5px] font-medium text-[#4b5162] hover:bg-[#eef0f4]">
                Select All
              </button>
              <button type="button" onClick={() => set("neighborhoods", [])}
                className="rounded-lg border border-[#e2e4ea] bg-[#f7f8fa] px-3 py-1.5 text-[12.5px] font-medium text-[#4b5162] hover:bg-[#eef0f4]">
                Deselect All
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {neighborhoodList.map((n) => (
                <label key={n} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-[#e2e4ea] bg-white px-3 py-2.5 text-[14px] text-[#111318] transition-colors hover:border-[#c7ccd6]">
                  <input type="checkbox" name="neighborhoods" value={n} checked={formData.neighborhoods.includes(n)}
                    onChange={(e) => toggleNeighborhood(e.target.checked, n)} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">{n}</span>
                </label>
              ))}
            </div>

            {/* Nearby submarkets — San Antonio only */}
            {formData.city === "San Antonio" && (
              <div className="mt-3 flex flex-col gap-2">
                <label className={`${labelClass} font-semibold`}>Nearby Submarkets</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => set("submarkets", [...SA_SUBMARKETS])}
                    className="rounded-lg border border-[#e2e4ea] bg-[#f7f8fa] px-3 py-1.5 text-[12.5px] font-medium text-[#4b5162] hover:bg-[#eef0f4]">
                    Select All
                  </button>
                  <button type="button" onClick={() => set("submarkets", [])}
                    className="rounded-lg border border-[#e2e4ea] bg-[#f7f8fa] px-3 py-1.5 text-[12.5px] font-medium text-[#4b5162] hover:bg-[#eef0f4]">
                    Deselect All
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SA_SUBMARKETS.map((s) => (
                    <label key={s} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-[#e2e4ea] bg-white px-3 py-2.5 text-[14px] text-[#111318] transition-colors hover:border-[#c7ccd6]">
                      <input type="checkbox" name="submarkets" value={s} checked={formData.submarkets.includes(s)}
                        onChange={(e) => toggleSubmarket(e.target.checked, s)} className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 break-words">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Property type */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Property Type</label>
          <select name="propertyType" value={formData.propertyType} onChange={handlePropertyType} required className={`${inputClass} cursor-pointer`}>
            <option value="">Select Property Type</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Bedrooms */}
        {formData.propertyType !== "Studio" && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Number of Bedrooms</label>
            <select name="beds" value={formData.beds} onChange={handleBeds} required disabled={formData.propertyType === "Rental Home"} className={`${inputClass} cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}>
              <option value="">Number of Bedrooms?</option>
              {BED_OPTIONS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
            {formData.propertyType === "Rental Home" && (
              <div className={noteClass}>(Rental Homes are 3+ bedrooms only)</div>
            )}
          </div>
        )}

        {/* Bathrooms */}
        {formData.propertyType !== "Studio" && formData.beds && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Number of Bathrooms</label>
            <select name="baths" value={formData.baths} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
              <option value="">Number of Bathrooms?</option>
              <option value="1" disabled={formData.beds !== "1" || formData.propertyType === "Rental Home"}>1 Bathroom</option>
              <option value="2">2 Bathrooms</option>
              <option value="3+" disabled={formData.beds !== "3+"}>3+ Bathrooms</option>
            </select>
          </div>
        )}

        {/* Desired rent */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Desired Monthly Rent</label>
          <select name="desiredRent" value={formData.desiredRent} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
            <option value="">Desired Monthly Rent</option>
            {RENT_RANGE_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Credit score */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Estimated Credit Score</label>
          <input type="number" name="creditScore" value={formData.creditScore} onChange={handleCreditScore}
            placeholder="Estimated Credit Score (300-850)" required min={300} max={850} step={1} inputMode="numeric" className={inputClass} />
          <div className={noteClass}>
            You can check Credit Karma for free. Your exact score helps us match you with apartments that are more likely to approve you.
          </div>
        </div>

        {/* Rental background */}
        <div className="flex flex-col gap-1.5">
          <label className={`${labelClass} font-semibold`}>Rental Background</label>
          <select name="creditHistory" value={formData.creditHistory} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
            <option value="">Select Rental Background</option>
            {CREDIT_HISTORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className="mt-1 rounded-lg border border-[#f0d98a] bg-[#fff8e1] p-3 text-[13px] leading-relaxed text-[#6b5b2e]">
            Please answer honestly. Some apartments are flexible depending on the situation, and this helps us match you with communities that are more likely to approve you.
          </div>
        </div>

        {/* Broken lease */}
        {formData.creditHistory === "Broken Lease" && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>How old is the broken lease?</label>
              <select name="brokenLeaseAge" value={formData.brokenLeaseAge} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
                <option value="">How old is the broken lease?</option>
                {HISTORY_AGE_OPTIONS.map((a) => (<option key={a} value={a}>{a}</option>))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Approximate balance owed</label>
              <select name="brokenLeaseAmount" value={formData.brokenLeaseAmount} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
                <option value="">Approximate balance owed</option>
                {BALANCE_OPTIONS.map((b) => (<option key={b} value={b}>{b}</option>))}
              </select>
            </div>
          </>
        )}

        {/* Eviction */}
        {formData.creditHistory === "Eviction" && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Did it go to court?</label>
              <select name="evictionCourt" value={formData.evictionCourt} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
                <option value="">Did it go to court?</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>How old is the eviction?</label>
              <select name="evictionAge" value={formData.evictionAge} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
                <option value="">How old is the eviction?</option>
                {HISTORY_AGE_OPTIONS.map((a) => (<option key={a} value={a}>{a}</option>))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Approximate balance owed</label>
              <select name="evictionBalance" value={formData.evictionBalance} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
                <option value="">Approximate balance owed</option>
                {BALANCE_OPTIONS.map((b) => (<option key={b} value={b}>{b}</option>))}
              </select>
            </div>
          </>
        )}

        {/* Criminal background */}
        <div className="flex flex-col gap-1.5">
          <label className={`${labelClass} font-semibold`}>Criminal Background</label>
          <select name="criminalBackground" value={formData.criminalBackground} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
            <option value="">Select Criminal Background</option>
            {CRIMINAL_BACKGROUND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className={noteClass}>
            Some communities have restrictions based on certain offenses. This helps us avoid wasting your time on properties that may not work.
          </div>
        </div>

        {/* Criminal charge (any non-None background) */}
        {formData.criminalBackground && formData.criminalBackground !== "None" && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Charge Type</label>
            <select name="criminalCharge" value={formData.criminalCharge} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
              <option value="">Select Charge Type</option>
              {CRIMINAL_CHARGE_OPTIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
        )}

        {/* Felony age */}
        {formData.criminalBackground === "Felony" && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>How old is the felony?</label>
            <select name="felonyAge" value={formData.felonyAge} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
              <option value="">How old is the felony?</option>
              {HISTORY_AGE_OPTIONS.map((a) => (<option key={a} value={a}>{a}</option>))}
            </select>
          </div>
        )}

        {/* Misdemeanor age */}
        {formData.criminalBackground === "Misdemeanor" && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>How old is the misdemeanor?</label>
            <select name="misdemeanorAge" value={formData.misdemeanorAge} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
              <option value="">How old is the misdemeanor?</option>
              {HISTORY_AGE_OPTIONS.map((a) => (<option key={a} value={a}>{a}</option>))}
            </select>
          </div>
        )}

        {/* Notes */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Anything else we should know?</label>
          <textarea name="notes" value={formData.notes} onChange={handleChange} rows={4} placeholder="Anything else we should know?" className={`${inputClass} resize-y`} />
        </div>

        {/* Honeypot (hidden) */}
        <input type="text" name="website" value={formData.website} onChange={handleChange} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />

        {/* Consent */}
        {consentEnabled && (
          <div className="mt-1 border-t border-[#eef0f4] pt-4">
            <label className="flex min-w-0 items-start gap-2.5 text-[12.5px] leading-relaxed text-[#6b7280]">
              <input type="checkbox" required checked={formData.sms_consent}
                onChange={(e) => set("sms_consent", e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d0d3dc]" />
              <span className="min-w-0 break-words">{consentText}</span>
            </label>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          className="mt-2 w-full break-words rounded-full px-6 py-4 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.01]"
          style={{ backgroundColor: buttonColor }}
        >
          {config.copy.buttonText}
        </button>
      </form>

      {/* Scoped reset for the native date field: the global stylesheet stretches
          the calendar-picker indicator to a full-size absolute overlay (a
          click-anywhere hack for the marketing date fields). That overlay
          escapes here and covers part of the form, so restore the normal
          inline calendar icon — for THIS form's date input only. */}
      <style>{`
        input[type="date"].slf-date-input::-webkit-calendar-picker-indicator {
          position: static;
          inset: auto;
          width: auto;
          height: auto;
          z-index: auto;
          opacity: 0.6;
          cursor: pointer;
        }
      `}</style>
    </section>
  )
}
