"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase/client"
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

      // Fire-and-forget — Calendar failure must never block lead creation
      console.log("🔥 NEW LEAD FETCH STARTING")
      const calendarPayload = {
        first_name:   data.first_name,
        last_name:    data.last_name,
        phone:        data.phone,
        city:         data.city,
        source:       data.source,
        desired_rent: data.desired_rent,
        beds:         data.beds,
        move_date:    data.move_date,
        credit_score: data.credit_score,
      }
      console.log("🔥 [LeadFormModal] Calendar payload:", JSON.stringify(calendarPayload, null, 2))
      fetch("/api/google/new-lead-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name:   data.first_name,
          last_name:    data.last_name,
          phone:        data.phone,
          city:         data.city,
          source:       data.source,
          desired_rent: data.desired_rent,
          beds:         data.beds,
          move_date:    data.move_date,
          credit_score: data.credit_score,
        }),
      }).then(async (res) => {
        const json = await res.json().catch(() => null)
        console.log("🔥 [LeadFormModal] Calendar route response status:", res.status)
        console.log("🔥 [LeadFormModal] Calendar route response body:", JSON.stringify(json, null, 2))
      }).catch((err) => {
        console.error("🔥 [LeadFormModal] New lead Calendar fetch threw:", err)
      })

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
<div className="p-6 overflow-y-auto">
  <LeadFields
    form={form}
    updateField={updateField}
  />
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