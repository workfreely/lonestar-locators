export function TextField({
  label,
  value,
  onChange,
  multiline,
  maxLength,
  placeholder,
}: {
  /** Optional. Omit when a nearby section heading already names the field —
   *  repeating it produced a heading and a label saying the same thing. */
  label?: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  maxLength?: number
  /** Optional greyed-out placeholder (e.g. the default value shown when blank). */
  placeholder?: string
}) {
  const inputClass =
    "w-full rounded-lg border border-[#e5e7ee] bg-[#f9fafb] px-3 py-2.5 text-[13.5px] text-[#111318] outline-none transition-colors focus:border-[#2f6bff] focus:bg-white"

  return (
    <div className="flex flex-col gap-1.5 py-2">
      {/* Skipped entirely when there is neither a label nor a counter, so an
          unlabelled field sits flush under its heading instead of carrying an
          empty row's height. */}
      {(label !== undefined || maxLength !== undefined) && (
        <div className="flex items-center justify-between gap-2">
          {label !== undefined && <label className="text-[12px] font-semibold text-[#6b7280]">{label}</label>}
          {/* ml-auto so a counter with no label still sits right, where it does
              in every labelled field. */}
          {maxLength !== undefined && (
            <span className="ml-auto shrink-0 text-[11px] text-[#9098a8]">
              {value.length}/{maxLength}
            </span>
          )}
        </div>
      )}
      {multiline ? (
        <textarea
          className={`${inputClass} resize-none`}
          rows={3}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={inputClass}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
