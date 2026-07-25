export function TextField({
  label,
  value,
  onChange,
  multiline,
  maxLength,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  maxLength?: number
}) {
  const inputClass =
    "w-full rounded-lg border border-[#e5e7ee] bg-[#f9fafb] px-3 py-2.5 text-[13.5px] text-[#111318] outline-none transition-colors focus:border-[#2f6bff] focus:bg-white"

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[12px] font-semibold text-[#6b7280]">{label}</label>
        {maxLength !== undefined && (
          <span className="shrink-0 text-[11px] text-[#9098a8]">
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      {multiline ? (
        <textarea
          className={`${inputClass} resize-none`}
          rows={3}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input className={inputClass} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}
