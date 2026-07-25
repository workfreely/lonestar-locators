export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex rounded-full border border-[#e5e7ee] bg-[#f4f5f8] p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`flex-1 rounded-full py-1.5 text-[12.5px] font-semibold transition-colors ${
            value === option.id ? "bg-white text-[#111318] shadow-sm" : "text-[#9098a8]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
