"use client"

import { useState } from "react"
import LeadFields from "./LeadFields"

export default function LeadFormModal({
  open,
  onClose,
  onLeadCreated,
}: {
  open: boolean
  onClose: () => void
  onLeadCreated: (lead: any) => void
}) {
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    move_date: "",
    city: "",
    neighborhoods: "",
    submarkets: "",
    property_type: "",
    desired_rent: "",
    beds: "",
    baths: "",
    income: "",
    credit_history: "",
    credit_score: "",
    criminal_background: "",
    notes: "",
    locator_notes: "",
    instagram: "",
    tiktok: "",
    facebook: "",

    // defaults
    source: "",
    crm_status: "new",
    priority: "warm",
    lead_type: "full",
  })

  if (!open) return null

  function updateField(
    key: string,
    value: string
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  async function handleSubmit() {
    if (!form.source) {
      alert("Please select a lead source.")
      return
    }

    if (!form.city) {
      alert("Please select a city.")
      return
    }

    try {
      setLoading(true)

      const sourceLabel = form.source.charAt(0).toUpperCase() + form.source.slice(1)
      const timestamp   = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
      const crmNote     = `Lead manually added through CRM on ${timestamp}. Source selected: ${sourceLabel}.`
      const locatorNotes = form.locator_notes
        ? `${crmNote}\n\n${form.locator_notes}`
        : crmNote

      // Routed through /api/leads/submit (not a direct client-side insert)
      // so manual "Add Lead" entries get the same field allowlist,
      // honeypot, and duplicate-detection protection the public forms
      // already have. Calendar creation for a genuinely new lead now
      // happens server-side inside that route — no separate client-side
      // trigger needed here (avoids double-firing one for exact-match
      // resubmissions and skips it entirely for those, same as the public
      // forms).
      const submitRes = await fetch("/api/leads/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formType: "full",
          lead: { ...form, locator_notes: locatorNotes },
        }),
      })

      const submitJson = await submitRes.json().catch(() => null)

      if (!submitRes.ok || !submitJson?.success) {
        console.error(submitJson?.error)
        alert("Could not create lead")
        return
      }

      const data = submitJson.lead

      if (submitJson.action === "updated_existing") {
        alert(
          `This looks like an existing lead (${data.first_name} ${data.last_name}) — updated their record instead of creating a new one.`
        )
      } else if (submitJson.action === "possible_duplicate") {
        alert(
          "Created — but this may be a duplicate of an existing lead. It's flagged for review on the board."
        )
      }

      onLeadCreated(data)

      onClose()

      setForm({
        first_name: "",
        last_name: "",
        phone: "",
        email: "",
        move_date: "",
        city: "",
        neighborhoods: "",
        submarkets: "",
        property_type: "",
        desired_rent: "",
        beds: "",
        baths: "",
        income: "",
        credit_history: "",
        credit_score: "",
        criminal_background: "",
        notes: "",
        locator_notes: "",
        instagram: "",
        tiktok: "",
        facebook: "",

        source: "",
        crm_status: "new",
        priority: "warm",
        lead_type: "full",
      })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex justify-end">

      {/* PANEL */}
      <div className="w-full max-w-[700px] h-full bg-[var(--crm-panel)] shadow-2xl overflow-y-auto">

        {/* HEADER */}
        <div className="sticky top-0 bg-[var(--crm-panel)] border-b border-[var(--crm-border)] px-6 py-5 z-20 flex items-center justify-between">
          <div>
            <div className="text-2xl font-black tracking-tight text-[var(--crm-text-primary)]">
              Add Lead
            </div>

            <div className="text-sm text-[var(--crm-text-secondary)] mt-1">
              Create a new CRM lead manually
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)] text-xl"
          >
            ✕
          </button>
        </div>
        
{/* BODY */}
<div className="p-6 overflow-y-auto">
  <LeadFields
    form={form}
    updateField={updateField}
  />
</div>
        
        {/* FOOTER */}
        <div className="sticky bottom-0 bg-[var(--crm-panel)] border-t border-[var(--crm-border)] p-5 flex justify-end gap-3">

          <button
            onClick={onClose}
            className="px-5 py-3 rounded-2xl border border-[var(--crm-border)] text-sm font-medium text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl text-sm font-semibold transition"
          >
            {loading ? "Creating..." : "Create Lead"}
          </button>

        </div>
      </div>
    </div>
  )
}