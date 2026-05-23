"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase/client"

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

    // defaults
    source: "manual",
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
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from("leads")
        .insert([form])
        .select("*")
        .single()

      if (error) {
        console.error(error)
        alert("Could not create lead")
        return
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

        source: "manual",
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
      <div className="w-full max-w-[700px] h-full bg-white shadow-2xl overflow-y-auto">

        {/* HEADER */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-5 z-20 flex items-center justify-between">
          <div>
            <div className="text-2xl font-black tracking-tight text-gray-900">
              Add Lead
            </div>

            <div className="text-sm text-gray-500 mt-1">
              Create a new CRM lead manually
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 space-y-6">

          {/* CONTACT */}
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">
              Contact Info
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="First Name"
                value={form.first_name}
                onChange={(e) =>
                  updateField("first_name", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />

              <input
                placeholder="Last Name"
                value={form.last_name}
                onChange={(e) =>
                  updateField("last_name", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />

              <input
                placeholder="Phone"
                value={form.phone}
                onChange={(e) =>
                  updateField("phone", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />

              <input
                placeholder="Email"
                value={form.email}
                onChange={(e) =>
                  updateField("email", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />
            </div>
          </div>

          {/* MOVE */}
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">
              Move Details
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
  type="text"
  placeholder="Move Date"
  value={form.move_date}
  onChange={(e) =>
    updateField("move_date", e.target.value)
  }
  className="border rounded-2xl px-4 py-3 text-sm"
/>

              <input
                placeholder="City"
                value={form.city}
                onChange={(e) =>
                  updateField("city", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />

              <input
                placeholder="Neighborhoods"
                value={form.neighborhoods}
                onChange={(e) =>
                  updateField("neighborhoods", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />

              <input
                placeholder="Submarkets"
                value={form.submarkets}
                onChange={(e) =>
                  updateField("submarkets", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />
            </div>
          </div>

          {/* PROPERTY */}
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">
              Property Preferences
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Property Type"
                value={form.property_type}
                onChange={(e) =>
                  updateField("property_type", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />

              <input
                placeholder="Desired Rent"
                value={form.desired_rent}
                onChange={(e) =>
                  updateField("desired_rent", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />

              <input
                placeholder="Beds"
                value={form.beds}
                onChange={(e) =>
                  updateField("beds", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />

              <input
                placeholder="Baths"
                value={form.baths}
                onChange={(e) =>
                  updateField("baths", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />
            </div>
          </div>

          {/* QUALIFICATION */}
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">
              Qualification
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Income"
                value={form.income}
                onChange={(e) =>
                  updateField("income", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />

              <input
                placeholder="Credit Score"
                value={form.credit_score}
                onChange={(e) =>
                  updateField("credit_score", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />

              <input
                placeholder="Credit History"
                value={form.credit_history}
                onChange={(e) =>
                  updateField("credit_history", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />

              <input
                placeholder="Criminal Background"
                value={form.criminal_background}
                onChange={(e) =>
                  updateField("criminal_background", e.target.value)
                }
                className="border rounded-2xl px-4 py-3 text-sm"
              />
            </div>
          </div>

          {/* NOTES */}
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">
              Notes
            </div>

            <div className="space-y-3">
              <textarea
                placeholder="Client Notes"
                value={form.notes}
                onChange={(e) =>
                  updateField("notes", e.target.value)
                }
                className="w-full h-24 border rounded-2xl px-4 py-3 text-sm"
              />

              <textarea
                placeholder="Locator Notes"
                value={form.locator_notes}
                onChange={(e) =>
                  updateField(
                    "locator_notes",
                    e.target.value
                  )
                }
                className="w-full h-24 border rounded-2xl px-4 py-3 text-sm"
              />
            </div>
          </div>

        </div>

        {/* FOOTER */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-5 flex justify-end gap-3">

          <button
            onClick={onClose}
            className="px-5 py-3 rounded-2xl border border-gray-300 text-sm font-medium"
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