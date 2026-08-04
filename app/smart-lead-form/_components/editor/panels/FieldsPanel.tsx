"use client"

import type { SmartLeadFormConfig } from "../../../_lib/types"
import Switch from "../ui/Switch"

type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void
type FieldKey = keyof SmartLeadFormConfig["fields"]

const FIELD_ROWS: { key: FieldKey; label: string; note?: string }[] = [
  { key: "moveDate", label: "Move-in date" },
  { key: "location", label: "City" },
  { key: "propertyDetails", label: "Property" },
  { key: "desiredRent", label: "Monthly Rent" },
  { key: "income", label: "Household Income" },
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
      <div className="rounded-xl bg-[#f4f5f8] p-3 text-[12px] leading-relaxed text-[#6b7280]">
        Choose which fields your form collects. Hide any you don&apos;t need — the essentials stay required.
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Always required</p>
        <div className="flex flex-wrap gap-2">
          {REQUIRED_FIELDS.map((r) => (
            <span key={r} className="rounded-full bg-[#eef3ff] px-3 py-1.5 text-[12.5px] font-medium text-[#2f6bff]">
              {r}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-[#9098a8]">These four always appear and can&apos;t be turned off.</p>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Optional fields</p>
        <div className="flex flex-col gap-2">
          {FIELD_ROWS.map((row) => (
            <div
              key={row.key}
              className="flex items-center gap-3 rounded-xl border border-[#e5e7ee] bg-white px-4 py-2"
            >
              <div className="flex-1">
                <p className="text-[13.5px] font-medium text-[#111318]">{row.label}</p>
                {row.note && <p className="text-[11.5px] text-[#9098a8]">{row.note}</p>}
              </div>
              <Switch checked={fields[row.key]} onChange={() => toggle(row.key)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
