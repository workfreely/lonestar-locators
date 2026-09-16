"use client"

import type { SmartLeadFormConfig } from "../../../_lib/types"
import ToggleRow from "../ui/ToggleRow"
import Card from "../ui/Card"

type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void
type FieldKey = keyof SmartLeadFormConfig["fields"]

const FIELD_ROWS: { key: FieldKey; label: string; note?: string }[] = [
  { key: "moveDate", label: "Move-in date" },
  { key: "location", label: "City" },
  { key: "propertyDetails", label: "Property Type" },
  { key: "mustHaveAmenities", label: "Must-Have Amenities", note: "Renters pick up to 3." },
  { key: "desiredRent", label: "Monthly Rent" },
  { key: "income", label: "Monthly Income" },
  { key: "creditScore", label: "Credit Score" },
  { key: "rentalBackground", label: "Rental History", note: "Includes broken-lease / eviction follow-ups." },
  { key: "criminalBackground", label: "Criminal History" },
  { key: "notes", label: "Notes" },
]

const REQUIRED_FIELDS = ["First Name", "Last Name", "Email", "Phone"]

const ALL_ON: SmartLeadFormConfig["fields"] = {
  moveDate: true,
  location: true,
  propertyDetails: true,
  mustHaveAmenities: true,
  desiredRent: true,
  income: true,
  creditScore: true,
  rentalBackground: true,
  criminalBackground: true,
  notes: true,
}

export default function FieldsPanel({
  config,
  onChange,
}: {
  config: SmartLeadFormConfig
  onChange: Updater
}) {
  const fields = config.fields ?? ALL_ON

  function toggle(key: FieldKey) {
    onChange((prev) => ({
      ...prev,
      fields: { ...(prev.fields ?? ALL_ON), [key]: !(prev.fields ?? ALL_ON)[key] },
    }))
  }

  return (
    <div className="flex flex-col gap-6">
      <Card muted className="text-[12px] leading-relaxed text-[#6b7280]">
        Show or hide fields on your Smart Lead Form.
      </Card>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Always required</p>
        <div className="flex flex-wrap gap-2">
          {REQUIRED_FIELDS.map((r) => (
            <span key={r} className="rounded-full bg-[#eef3ff] px-3 py-1.5 text-[12.5px] font-medium text-[#2f6bff]">
              {r}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Optional fields</p>
        <div className="divide-y divide-[#f0f1f5]">
          {FIELD_ROWS.map((row) => (
            <ToggleRow
              key={row.key}
              label={row.label}
              note={row.note}
              checked={fields[row.key]}
              onChange={() => toggle(row.key)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
