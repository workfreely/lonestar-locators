"use client"

import { useMemo, useState } from "react"
import type { SmartLeadFormConfig, FieldConfig } from "../../../_lib/types"
import { BASE_FIELDS, CONDITIONAL_RULES } from "../../../_lib/conditionalFields"

function Field({ field, value, onChange }: { field: FieldConfig; value: string; onChange: (v: string) => void }) {
  const inputClass =
    "w-full rounded-xl border border-[#e2e4ea] bg-white px-4 py-3.5 text-[15px] text-[#111318] outline-none transition-colors focus:border-[#2f6bff]"

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-medium text-[#4b5162]">{field.label}</label>
      {field.type === "select" ? (
        <select
          className={`${inputClass} cursor-pointer`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>
            Select…
          </option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type}
          className={inputClass}
          value={value}
          placeholder={field.placeholder}
          autoComplete={field.autoComplete}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

export default function LeadFormFields({ config }: { config: SmartLeadFormConfig }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const { buttonColor } = config.branding
  const { enabled: consentEnabled, text: consentText } = config.consent

  const visibleConditionalFields = useMemo(
    () => CONDITIONAL_RULES.filter((rule) => rule.when(values)).flatMap((rule) => rule.fields),
    [values]
  )

  function update(id: string, v: string) {
    setValues((prev) => ({ ...prev, [id]: v }))
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

  return (
    <section className="px-5 py-8 sm:px-8" id="smart-lead-form">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(true)
        }}
        className="mx-auto flex max-w-lg flex-col gap-4 rounded-2xl border border-[#e2e4ea] bg-white p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] sm:p-7"
      >
        {BASE_FIELDS.map((field) => (
          <Field key={field.id} field={field} value={values[field.id] ?? ""} onChange={(v) => update(field.id, v)} />
        ))}

        {visibleConditionalFields.map((field) => (
          <Field key={field.id} field={field} value={values[field.id] ?? ""} onChange={(v) => update(field.id, v)} />
        ))}

        {consentEnabled && (
          <div className="mt-1 border-t border-[#eef0f4] pt-4">
            <label className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-[#6b7280]">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d0d3dc]" />
              {consentText}
            </label>
          </div>
        )}

        <button
          type="submit"
          className="mt-2 w-full rounded-full px-6 py-4 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.01]"
          style={{ backgroundColor: buttonColor }}
        >
          {config.copy.buttonText}
        </button>
      </form>
    </section>
  )
}
