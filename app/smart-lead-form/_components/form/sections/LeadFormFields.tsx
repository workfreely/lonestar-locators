"use client"

import { useMemo, useState } from "react"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import type { SmartLeadFormConfig } from "../../../_lib/types"
import { MARKETS, getMarketByName, marketsForSlugs } from "@/lib/markets/catalog"
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

// The full neighborhood option list for a city = the catalog's neighborhoods
// with a generated "All of {city}" at the top (matches the historical shape;
// the "All of" pseudo-option is never stored in the catalog).
function neighborhoodOptions(cityName: string): string[] {
  const m = getMarketByName(cityName)
  if (!m) return []
  return [`All of ${cityName}`, ...m.neighborhoods]
}

// ─────────────────────────────────────────────────────────────────────────────
// Fields, conditional logic, and validation are ported 1:1 from LandingForm.tsx
// (the source of truth) — same field names, options, and rules — restyled with
// the Smart Lead Form's own light input styling. Only the form portion of the
// page is affected; Hero / agent / testimonials / FAQ / footer are untouched.
//
// This is the builder preview, so on submit it shows the confirmation state
// rather than posting a lead (unchanged from before).
// ─────────────────────────────────────────────────────────────────────────────

// Shared styling (matches the existing Smart Lead Form light form aesthetic).
// Controls are 17px so they read clearly on a phone AND stay ≥16px, which stops
// iOS from zooming the page on focus (the "intermediate bubble"). White fields on
// the off-white form surface, with a stronger #cbd0da border for separation.
const inputClass =
  "w-full rounded-xl border border-[#cbd0da] bg-white px-4 py-3.5 text-[17px] text-[#111318] outline-none transition-colors focus:border-[#2f6bff]"
const labelClass = "text-[14px] font-semibold text-[#374151]"
const noteClass = "mt-1.5 text-[15px] leading-relaxed text-[#4b5563]"

// ── Move-in date helpers (timezone-safe) ─────────────────────────────────────
// Parse a stored "YYYY-MM-DD" as a LOCAL calendar date (via parts, never
// new Date(iso) which is UTC-midnight and can shift a day). Keeps the calendar
// showing the exact submitted day.
function parseLocalDate(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim())
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
// Serialize a selected Date back to "YYYY-MM-DD" from LOCAL parts (never
// toISOString, which shifts the day in some timezones). This is the exact value
// the DB, CRM, emails, Companion, and guest card already expect for move_date.
function formatLocalYMD(date: Date): string {
  const y = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${y}-${mm}-${dd}`
}
// Local midnight today — the earliest selectable move-in date (no past dates).
function startOfToday(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

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
  income: string
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

// Monthly household income brackets — helps qualify against the ~3x-rent rule.
const INCOME_OPTIONS = [
  "Under $2,500 / month",
  "$2,500 – $4,000 / month",
  "$4,000 – $6,000 / month",
  "$6,000 – $8,000 / month",
  "$8,000 – $10,000 / month",
  "$10,000+ / month",
]

// Every field group is shown by default (used when a saved config predates the
// per-field toggles, so older published forms keep showing everything).
const ALL_FIELDS_VISIBLE = {
  moveDate: true,
  location: true,
  propertyDetails: true,
  desiredRent: true,
  income: true,
  creditScore: true,
  rentalBackground: true,
  criminalBackground: true,
  notes: true,
}

const INITIAL: FormData = {
  firstName: "", lastName: "", phone: "", email: "", moveDate: "", city: "",
  neighborhoods: [], submarkets: [], propertyType: "", desiredRent: "", income: "", beds: "", baths: "",
  creditScore: "", creditHistory: "", brokenLeaseAge: "", brokenLeaseAmount: "",
  evictionCourt: "", evictionAge: "", evictionBalance: "", criminalBackground: "",
  criminalCharge: "", felonyAge: "", misdemeanorAge: "", notes: "", website: "", sms_consent: false,
}

export default function LeadFormFields({
  config,
  serviceAreaSlugs,
  submitUsername,
}: {
  config: SmartLeadFormConfig
  serviceAreaSlugs?: string[]
  // Public page: submit real, attributed leads for this username. Absent in the
  // editor preview (submit is a no-op confirmation there).
  submitUsername?: string
}) {
  const [formData, setFormData] = useState<FormData>(INITIAL)
  // Earliest selectable move-in date (today); memoized so the picker isn't handed
  // a new Date object on every keystroke-driven re-render.
  const minMoveDate = useMemo(() => startOfToday(), [])
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Cities shown = the workspace's selected markets (live). Fall back to the
  // full catalog when no selection is provided (e.g. an unconfigured workspace
  // or a bare editor preview) so the form is never empty.
  const enabledMarkets =
    serviceAreaSlugs && serviceAreaSlugs.length ? marketsForSlugs(serviceAreaSlugs) : MARKETS

  const { buttonColor } = config.branding
  const { enabled: consentEnabled, text: consentText } = config.consent
  // Per-field visibility (First/Last/Email/Phone are always shown + required and
  // are not in this map). Falls back to all-visible for pre-toggle configs.
  const f = config.fields ?? ALL_FIELDS_VISIBLE

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
      const all = neighborhoodOptions(prev.city)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    // ─── Validation — ported from LandingForm, gated by field visibility so a
    // hidden field can never block submission ───
    if (f.moveDate && !formData.moveDate) return alert("Please select your move date.")
    if (f.location && formData.neighborhoods.length === 0)
      return alert("Please select at least one preferred neighborhood.")
    if (
      f.rentalBackground &&
      formData.creditHistory === "Broken Lease" &&
      (!formData.brokenLeaseAge || !formData.brokenLeaseAmount)
    )
      return alert("Please complete the broken lease details.")
    if (
      f.rentalBackground &&
      formData.creditHistory === "Eviction" &&
      (!formData.evictionAge || !formData.evictionBalance)
    )
      return alert("Please complete the eviction details.")

    // Honeypot — silently ignore bot submissions.
    if (formData.website) return

    // Editor preview (no username) — confirm rather than post (unchanged).
    if (!submitUsername) {
      setSubmitted(true)
      return
    }

    // Public page — post a real, attributed lead. The username is resolved
    // server-side to the owning workspace/agent (never trusted from the body).
    setSubmitting(true)
    try {
      const res = await fetch("/api/leads/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formType: "full",
          formUsername: submitUsername,
          lead: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            phone: formData.phone,
            email: formData.email,
            move_date: formData.moveDate || null,
            city: formData.city,
            neighborhoods: formData.neighborhoods.join(", "),
            submarkets: formData.submarkets?.join(", "),
            property_type: formData.propertyType,
            desired_rent: formData.desiredRent,
            income: formData.income,
            beds: formData.beds,
            baths: formData.baths,
            credit_history: formData.creditHistory,
            credit_score: formData.creditScore,
            broken_lease_age: formData.brokenLeaseAge,
            broken_lease_amount: formData.brokenLeaseAmount,
            eviction_court: formData.evictionCourt,
            eviction_age: formData.evictionAge,
            eviction_balance: formData.evictionBalance,
            criminal_background: formData.criminalBackground,
            criminal_charge: formData.criminalCharge,
            felony_age: formData.felonyAge,
            misdemeanor_age: formData.misdemeanorAge,
            notes: formData.notes,
            website: formData.website,
            sms_opt_in: formData.sms_consent,
            sms_consent_at: formData.sms_consent ? new Date().toISOString() : null,
            source: "smart_lead_form",
            // Match the Lone Star renter path so the shared submit route fires
            // the same new-lead notification + Workflow Engine "Contact Lead".
            lead_type: "renter",
            lead_category: "renter",
          },
        }),
      })
      if (!res.ok) throw new Error("submit_failed")
      // Reuse the existing Lone Star thank-you page flow.
      const params = new URLSearchParams({ firstName: formData.firstName, city: formData.city })
      window.location.href = `/thank-you?${params.toString()}`
      return
    } catch {
      alert("Something went wrong submitting your request. Please try again.")
      setSubmitting(false)
    }
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

  const selectedMarket = formData.city ? getMarketByName(formData.city) : undefined
  const neighborhoodList = selectedMarket ? neighborhoodOptions(formData.city) : null

  return (
    <section className="px-5 py-8 sm:px-8" id="smart-lead-form">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-lg flex-col gap-4 rounded-2xl border border-[#e6e8ee] bg-[#f8f9fb] p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] sm:p-7"
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

        {/* Move-in date — react-datepicker popover (adapted from the marketing
            form). Clicking/tapping anywhere in the field opens a visible, month-
            navigable calendar; selecting a date fills the field and closes it.
            Value is stored/serialized as local "YYYY-MM-DD" (timezone-safe) — the
            exact move_date format the DB/CRM/emails/Companion/guest card expect. */}
        {f.moveDate && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="slf-move-date" className={labelClass}>Desired Move-In Date</label>
            <div className="slf-datepicker">
              <DatePicker
                id="slf-move-date"
                name="moveDate"
                selected={parseLocalDate(formData.moveDate)}
                onChange={(date: Date | null) =>
                  setFormData((prev) => ({ ...prev, moveDate: date ? formatLocalYMD(date) : "" }))
                }
                minDate={minMoveDate}
                dateFormat="MM/dd/yyyy"
                placeholderText="MM/DD/YYYY"
                className={`${inputClass} cursor-pointer`}
                wrapperClassName="w-full"
                popperPlacement="bottom-start"
                popperProps={{ strategy: "fixed" }}
                required
                autoComplete="off"
              />
            </div>
          </div>
        )}

        {/* City */}
        {f.location && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>City</label>
            <select name="city" value={formData.city} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
              <option value="">Select City</option>
              {enabledMarkets.map((m) => (
                <option key={m.slug} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Neighborhoods */}
        {f.location && neighborhoodList && (
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

            {/* Nearby submarkets — any market that defines them (catalog-driven) */}
            {selectedMarket && selectedMarket.submarkets.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                <label className={`${labelClass} font-semibold`}>Nearby Submarkets</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => set("submarkets", [...selectedMarket.submarkets])}
                    className="rounded-lg border border-[#e2e4ea] bg-[#f7f8fa] px-3 py-1.5 text-[12.5px] font-medium text-[#4b5162] hover:bg-[#eef0f4]">
                    Select All
                  </button>
                  <button type="button" onClick={() => set("submarkets", [])}
                    className="rounded-lg border border-[#e2e4ea] bg-[#f7f8fa] px-3 py-1.5 text-[12.5px] font-medium text-[#4b5162] hover:bg-[#eef0f4]">
                    Deselect All
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {selectedMarket.submarkets.map((s) => (
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
        {f.propertyDetails && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Property Type</label>
            <select name="propertyType" value={formData.propertyType} onChange={handlePropertyType} required className={`${inputClass} cursor-pointer`}>
              <option value="">Select Property Type</option>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        {/* Bedrooms */}
        {f.propertyDetails && formData.propertyType !== "Studio" && (
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
        {f.propertyDetails && formData.propertyType !== "Studio" && formData.beds && (
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
        {f.desiredRent && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Desired Monthly Rent</label>
            <select name="desiredRent" value={formData.desiredRent} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
              <option value="">Desired Monthly Rent</option>
              {RENT_RANGE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        )}

        {/* Income */}
        {f.income && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Monthly Household Income</label>
            <select name="income" value={formData.income} onChange={handleChange} required className={`${inputClass} cursor-pointer`}>
              <option value="">Select Monthly Income</option>
              {INCOME_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <div className={noteClass}>Most communities require income of about 3x the monthly rent.</div>
          </div>
        )}

        {/* Credit score */}
        {f.creditScore && (
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Estimated Credit Score</label>
          <input type="number" name="creditScore" value={formData.creditScore} onChange={handleCreditScore}
            placeholder="Estimated Credit Score (300-850)" required min={300} max={850} step={1} inputMode="numeric" className={inputClass} />
          <div className={noteClass}>
            You can check Credit Karma for free. Your exact score helps us match you with apartments that are more likely to approve you.
          </div>
        </div>
        )}

        {/* Rental background (+ broken-lease / eviction follow-ups) */}
        {f.rentalBackground && (
        <>
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
        </>
        )}

        {/* Criminal background (+ charge type / age follow-ups) */}
        {f.criminalBackground && (
        <>
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
        </>
        )}

        {/* Notes */}
        {f.notes && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Anything else we should know?</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows={4} placeholder="Anything else we should know?" className={`${inputClass} resize-y`} />
          </div>
        )}

        {/* Honeypot (hidden) */}
        <input type="text" name="website" value={formData.website} onChange={handleChange} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />

        {/* Consent */}
        {consentEnabled && (
          <div className="mt-1 border-t border-[#eef0f4] pt-4">
            <label className="flex min-w-0 items-start gap-2.5 text-[16px] leading-relaxed text-[#4b5563]">
              <input type="checkbox" required checked={formData.sms_consent}
                onChange={(e) => set("sms_consent", e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#cbd0da]" />
              <span className="min-w-0 break-words">{consentText}</span>
            </label>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          className="mt-2 w-full break-words rounded-full px-6 py-4 text-[17px] font-semibold text-white transition-transform duration-300 hover:scale-[1.01]"
          style={{ backgroundColor: buttonColor }}
        >
          {config.copy.buttonText}
        </button>
      </form>

      {/* Scoped styling for the move-in date picker: make the react-datepicker
          input match THIS form's light input aesthetic, overriding the site-wide
          marketing `.react-datepicker__input-container input` rule (higher
          specificity via the `.slf-datepicker` wrapper). Only affects this form. */}
      <style>{`
        .slf-datepicker .react-datepicker-wrapper { display: block; width: 100%; }
        .slf-datepicker .react-datepicker__input-container input {
          width: 100%;
          box-sizing: border-box;
          border-radius: 0.75rem;
          border: 1px solid #cbd0da;
          background: #ffffff;
          padding: 0.875rem 1rem;
          font-size: 17px;
          line-height: 1.4;
          color: #111318;
          font-family: inherit;
          transition: border-color 0.15s ease;
        }
        .slf-datepicker .react-datepicker__input-container input::placeholder { color: #9aa0ad; }
        .slf-datepicker .react-datepicker__input-container input:focus {
          outline: none;
          border-color: #2f6bff;
          box-shadow: none;
        }
        /* Keep the calendar popover above the form and legible on the light card. */
        .react-datepicker-popper { z-index: 60; }
      `}</style>
    </section>
  )
}
