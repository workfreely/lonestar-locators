export default function Select<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string
  options: { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 py-2">
      {label && <label className="text-[12px] font-semibold text-[#6b7280]">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-lg border border-[#e5e7ee] bg-[#f9fafb] px-3 py-2.5 text-[13.5px] text-[#111318] outline-none transition-colors focus:border-[#2f6bff] focus:bg-white"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
