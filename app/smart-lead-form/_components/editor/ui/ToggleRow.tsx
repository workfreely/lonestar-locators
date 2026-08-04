import Switch from "./Switch"

// The ONE toggle-row pattern for the whole editor: Content section toggles,
// Fields toggles, Consent, and footer sub-toggles all use this.
//
// Layout invariants that keep every switch on the same grid:
//   • the row has NO horizontal padding — it sits on the shared panel gutter,
//     so the label starts on the left grid line and the switch ends on the
//     right grid line (never a per-row pr hack, never a card-padding side effect)
//   • the label container is min-w-0 flex-1 so it always shrinks — the shrink-0
//     switch can never be pushed past the panel edge and clipped
//   • the switch is the same blue Switch everywhere
export default function ToggleRow({
  label,
  note,
  checked,
  onChange,
  strong = false,
}: {
  label: string
  note?: string
  checked: boolean
  onChange: (v: boolean) => void
  /** Slightly heavier label for section-level headers (Headline, Highlights…). */
  strong?: boolean
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className={`text-[#111318] ${strong ? "text-[13px] font-semibold" : "text-[13.5px] font-medium"}`}>
          {label}
        </p>
        {note && <p className="text-[11.5px] text-[#9098a8]">{note}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}
