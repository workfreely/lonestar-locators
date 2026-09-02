"use client"

import { useEffect, useState } from "react"
import LeadFields from "./LeadFields"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"

export default function LeadFormModal({
  open,
  onClose,
  onLeadCreated,
  timeZone = DEFAULT_TIMEZONE,
}: {
  open: boolean
  onClose: () => void
  onLeadCreated: (lead: any) => void
  /** The locator's saved IANA timezone, so the manual-entry date reads as the
   *  day THEY added the lead — not the browser's zone and not UTC. */
  timeZone?: string
}) {
  const [loading, setLoading] = useState(false)
  // Set when the server reports an exact match and is waiting to be told whether
  // to update. Holds the payload so confirming re-sends exactly what was typed.
  const [pendingDuplicate, setPendingDuplicate] = useState<null | {
    leadPayload: Record<string, any>
    typedNotes: string
  }>(null)

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
    must_have_amenities: "",
    desired_rent: "",
    beds: "",
    baths: "",
    income: "",
    credit_history: "",
    credit_score: "",
    criminal_background: "",
    notes: "",
    locator_notes: "",

    // defaults
    source: "",
    crm_status: "new",
    priority: "warm",
    lead_type: "full",
  })

  // Broadcast open state so global surfaces (Ask Beast AI) can step aside while the
  // modal is up. A window event keeps them decoupled — Ask Beast AI is mounted in the
  // layout, not this subtree. Fires for both Add Lead and the future Edit Client mode
  // (same component). Restores on close.
  useEffect(() => {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent("lb:lead-modal", { detail: { open } }))
    return () => {
      window.dispatchEvent(new CustomEvent("lb:lead-modal", { detail: { open: false } }))
    }
  }, [open])

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

      // Manual-entry marker. Added ONLY here, the manual "Add Lead" surface, so
      // Smart Lead Form, CSV import, API and integration leads never carry it.
      //
      // Date only, in the locator's saved timezone — a lead added late evening in
      // Austin previously showed the next day's UTC date in their own CRM.
      //
      // The chosen Lead Source is no longer restated here: it is already stored
      // verbatim in `source` (and rendered from there), so repeating it in the
      // note only created a second copy that could drift.
      //
      // A duplicate marker is impossible on the exact-match update path: that
      // branch discards the incoming locator_notes entirely and prepends its own
      // history block to the EXISTING notes (see buildExactMatchUpdate), so this
      // string is only ever written on a genuine insert.
      const addedOn = new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone,
      })
      const crmNote = `Lead added manually on ${addedOn}.`
      const locatorNotes = form.locator_notes
        ? `${crmNote}\n${form.locator_notes}`
        : crmNote

      // Routed through /api/leads/submit (not a direct client-side insert)
      // so manual "Add Lead" entries get the same field allowlist,
      // honeypot, and duplicate-detection protection the public forms
      // already have. Calendar creation for a genuinely new lead now
      // happens server-side inside that route — no separate client-side
      // trigger needed here (avoids double-firing one for exact-match
      // resubmissions and skips it entirely for those, same as the public
      // forms).
      const leadPayload = { ...form, locator_notes: locatorNotes }

      const submitRes = await fetch("/api/leads/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formType: "full", manualEntry: true, lead: leadPayload }),
      })

      const submitJson = await submitRes.json().catch(() => null)

      if (!submitRes.ok || !submitJson?.success) {
        console.error(submitJson?.error)
        alert("Could not create lead")
        return
      }

      // Exact match — nothing has been written yet. Ask first; the form stays
      // open and populated behind the confirmation, so Cancel loses nothing.
      if (submitJson.action === "confirm_update_required") {
        setPendingDuplicate({ leadPayload, typedNotes: form.locator_notes ?? "" })
        setLoading(false)
        return
      }

      const data = submitJson.lead

      if (submitJson.action === "possible_duplicate") {
        alert(
          "Created — but this may be a duplicate of an existing lead. It's flagged for review on the board."
        )
      }

      onLeadCreated(data)

      onClose()

      resetForm()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }


  // Extracted so the create path and the confirmed-update path clear the form
  // identically — they previously would have drifted.
  function resetForm() {
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
      must_have_amenities: "",
      desired_rent: "",
      beds: "",
      baths: "",
      income: "",
      credit_history: "",
      credit_score: "",
      criminal_background: "",
      notes: "",
      locator_notes: "",

      source: "",
      crm_status: "new",
      priority: "warm",
      lead_type: "full",
    })
  }

  // "Update Lead" — re-sends the same payload with confirmUpdate, which is the
  // only thing that lets the route mutate the matched record. `manualNote`
  // carries ONLY what the locator typed: the "Lead added manually on …" marker
  // belongs to lead creation, and re-sending it would stamp a second one onto a
  // record that already has its own.
  async function confirmUpdateExisting() {
    const pending = pendingDuplicate
    if (!pending || loading) return
    setLoading(true)
    try {
      const res = await fetch("/api/leads/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formType: "full",
          manualEntry: true,
          confirmUpdate: true,
          manualNote: pending.typedNotes,
          lead: pending.leadPayload,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        console.error(json?.error)
        alert("Could not update lead")
        return
      }
      setPendingDuplicate(null)
      onLeadCreated(json.lead)
      onClose()
      resetForm()
    } finally {
      setLoading(false)
    }
  }


  return (
    <>
      {/* Duplicate confirmation. Sits ABOVE the Add Lead sheet (z-[10002]) and
          leaves the form mounted underneath, so Cancel returns the locator to
          exactly what they typed. Nothing has been written at this point. */}
      {pendingDuplicate && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--crm-panel)] p-6 shadow-2xl">
            <h3 className="text-[16px] font-bold text-[var(--crm-text-primary)]">Lead already exists</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--crm-text-secondary)]">
              Update this lead with the new information?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={confirmUpdateExisting}
                className="crm-cta w-full rounded-2xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {loading ? "…" : "Update Lead"}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => setPendingDuplicate(null)}
                className="w-full rounded-2xl border border-[var(--crm-border)] px-5 py-2.5 text-sm font-medium text-[var(--crm-text-secondary)] transition-colors hover:bg-[var(--crm-card)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    <div className="fixed inset-0 z-[10001] bg-black/40 backdrop-blur-sm flex justify-end">

      {/* PANEL */}
      <div className="w-full max-w-[700px] h-full bg-[var(--crm-panel)] shadow-2xl overflow-y-auto">

        {/* HEADER */}
        <div className="sticky top-0 bg-[var(--crm-panel)] border-b border-[var(--crm-border)] px-6 py-5 z-20 flex items-center justify-between">
          <div>
            <div className="text-2xl font-black tracking-tight text-[var(--crm-text-primary)]">
              Add Lead
            </div>

            <div className="text-sm text-[var(--crm-text-secondary)] mt-1">
              Create a new lead manually
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
<div className="p-6">
  <LeadFields
    form={form}
    updateField={updateField}
  />
</div>
        
        {/* FOOTER — in normal flow, immediately after the last section, so the
            form reads top-to-bottom and the modal has no dead space at the end.
            It was previously `sticky bottom-0`, which pinned it to the viewport
            bottom and forced a large compensating pad above it.
            The action group sits LEFT, on the same 24px gutter as the form body
            above it (px-6, matching the body's p-6), so the buttons line up with
            the fields rather than hugging the modal edge — and the bottom-right
            corner, where the floating Ask Beast AI trigger lives, stays clear
            without any change to that component. */}
        <div className="border-t border-[var(--crm-border)] px-6 pt-5 pb-6 flex justify-end gap-3">

          <button
            onClick={onClose}
            className="px-5 py-3 rounded-2xl border border-[var(--crm-border)] text-sm font-medium text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="crm-cta px-5 py-3 rounded-2xl text-sm font-semibold"
          >
            {loading ? "Creating..." : "Create Lead"}
          </button>

        </div>
      </div>
    </div>
    </>
  )
}
