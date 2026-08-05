export default function Select<T extends string>({
  label,
  options,
  groups,
  value,
  onChange,
}: {
  label?: string
  /** Flat options. When `groups` is also given, these render AFTER the groups. */
  options?: { id: T; label: string }[]
  /** Optional <optgroup> sections, rendered in order before any flat options. */
  groups?: { label: string; options: { id: T; label: string }[] }[]
  value: T
  onChange: (value: T) => void
}) {
  // A native <select> keeps the list in its declared order, never moves the
  // selected item, and shows the native ✓ on the current value — exactly the
  // required dropdown behavior with no custom reordering logic.
  return (
    <div className="flex flex-col gap-1.5 py-2">
      {label && <label className="text-[12px] font-semibold text-[#6b7280]">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-lg border border-[#e5e7ee] bg-[#f9fafb] px-3 py-2.5 text-[13.5px] text-[#111318] outline-none transition-colors focus:border-[#2f6bff] focus:bg-white"
      >
        {groups?.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
        {options?.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
