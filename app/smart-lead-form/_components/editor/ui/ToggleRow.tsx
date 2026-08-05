import Switch from "./Switch"

// The ONE toggle-row pattern for the whole editor: Content section toggles,
// Fields toggles, Consent, and footer sub-toggles all use this.
//
// Layout invariants:
//   • the row has NO horizontal padding — it sits on the shared panel gutter,
//     so the label starts on the left grid line (never a per-row hack).
//   • the label is capped with max-w (not a full flex-1 stretch, and NOT
//     justify-between) so the switch sits ~28px closer to the label instead of
//     being anchored to the far edge; the freed space stays EMPTY to the right
//     of the switch, inside the unchanged 34px right gutter.
//   • min-w-0 lets the label shrink and the shrink-0 switch can never be pushed
//     past the panel edge and clipped.
//   • the switch is the same blue Switch everywhere.
//
// The cap is sized to the fixed 560px panel (content column ≈ 500px): capping
// the label at 413px leaves ~28px empty between the switch and the right gutter,
// and every switch lands on the same column across all tabs.
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
      <div className="min-w-0 flex-1 max-w-[413px]">
        <p className={`text-[#111318] ${strong ? "text-[13px] font-semibold" : "text-[13.5px] font-medium"}`}>
          {label}
        </p>
        {note && <p className="text-[11.5px] text-[#9098a8]">{note}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}
