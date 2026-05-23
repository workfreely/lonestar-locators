"use client"

export default function LeadFields({
  form,
  updateField,
}: {
  form: any
  updateField: (key: string, value: string) => void
}) {
  return (
    <div className="space-y-6">

      {/* CONTACT INFO */}
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

      {/* MOVE DETAILS */}
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">
          Move Details
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input
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
              updateField("locator_notes", e.target.value)
            }
            className="w-full h-24 border rounded-2xl px-4 py-3 text-sm"
          />
        </div>
      </div>

    </div>
  )
}