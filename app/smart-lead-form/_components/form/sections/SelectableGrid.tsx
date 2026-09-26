// The ONE multi-select grid on the public form — Preferred Neighborhoods,
// Nearby Submarkets and Must-Have Amenities all render through it.
//
// The three used to carry byte-identical copies of this markup, which meant the
// mobile-density fix would have had to be made three times and could drift
// afterwards. One component, one place to change.
//
// Density: two columns from 360px up. A phone previously got ONE full-width row
// per option, which made a 12-neighborhood city an very long scroll. Below 360px
// it falls back to a single column, where two would leave ~140px per tile.
// Labels wrap to a second line rather than truncating — a renter needs to read
// "Floor-to-Ceiling Windows" in full — and the tile grows to fit, so touch
// targets never shrink.

export type SelectableOption = { value: string; label: string }

/** Compact bulk-select buttons, shared by the two Select All / Deselect All pairs. */
export const bulkButtonClass =
  "rounded-lg border border-[#e2e4ea] bg-[#f7f8fa] px-2.5 py-1 text-[12px] font-medium text-[#4b5162] hover:bg-[#eef0f4]"

export default function SelectableGrid({
  name,
  options,
  selected,
  onToggle,
  isDisabled,
}: {
  name: string
  options: SelectableOption[]
  selected: string[]
  onToggle: (checked: boolean, value: string) => void
  /** Optional per-option lock — Must-Have Amenities uses it for its max-3 cap. */
  isDisabled?: (value: string) => boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
      {options.map((o) => {
        const checked = selected.includes(o.value)
        const disabled = isDisabled ? isDisabled(o.value) : false
        return (
          <label
            key={o.value}
            className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-[15px] text-[#111318] transition-colors ${
              disabled
                ? "cursor-not-allowed border-[#e2e4ea] bg-white opacity-50"
                : checked
                  ? "cursor-pointer border-[#2f6bff] bg-[#eef3ff]"
                  : "cursor-pointer border-[#e2e4ea] bg-white hover:border-[#c7ccd6]"
            }`}
          >
            <input
              type="checkbox"
              name={name}
              value={o.value}
              checked={checked}
              disabled={disabled}
              onChange={(e) => onToggle(e.target.checked, o.value)}
              className="h-4 w-4 shrink-0 accent-[#2f6bff]"
            />
            <span className="min-w-0 break-words">{o.label}</span>
          </label>
        )
      })}
    </div>
  )
}
