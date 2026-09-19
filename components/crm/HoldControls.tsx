"use client"

import { useState } from "react"

// Compact Resume / Reschedule controls for a held lead. Reused by the board's
// Inactive → On Hold card and the Agenda "Lead On Hold" reminder so both offer
// the SAME two canonical paths. Reschedule reveals an inline date input and keeps
// the lead On Hold (only hold_follow_up_at changes); Resume clears the hold.
// Presentational only — the actual mutations live in DashboardClient (one source
// of truth that updates the board, Agenda and Companion together).
export default function HoldControls({
  leadId,
  followUpAt,
  onResume,
  onReschedule,
  size = "sm",
}: {
  leadId: string | number
  followUpAt?: string | null
  onResume?: (leadId: string | number) => void
  onReschedule?: (leadId: string | number, followUpDate: string) => void
  size?: "sm" | "xs"
}) {
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(followUpAt ?? "")

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  if (editing) {
    return (
      <div className="kb-hold-controls" onClick={stop}>
        {/* Same date affordance as the Pause/Archive dialog: lb-date-native gives a
            normal visible calendar icon (no giant overlay, not collapsed to 0),
            [color-scheme:dark] makes the icon/picker visible on the dark card, and
            onClick→showPicker opens Chrome's native picker from a click anywhere. */}
        <input
          type="date"
          className="lb-date-native [color-scheme:dark] kb-hold-date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker?.() } catch { /* not supported / already open */ } }}
          autoFocus
        />
        <button
          type="button"
          className="kb-hold-btn kb-hold-btn--primary"
          disabled={!date}
          onClick={() => {
            if (date && onReschedule) onReschedule(leadId, date)
            setEditing(false)
          }}
        >
          Save
        </button>
        <button type="button" className="kb-hold-btn" onClick={() => { setDate(followUpAt ?? ""); setEditing(false) }}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    // kb-hold-actions makes the two buttons equal-width side-by-side (see globals.css)
    // so Resume Search no longer visually dominates Reschedule.
    <div className={`kb-hold-controls kb-hold-actions${size === "xs" ? " kb-hold-controls--xs" : ""}`} onClick={stop}>
      {/* Reschedule (secondary) LEFT · Resume Search (primary) RIGHT — equal size. */}
      <button type="button" className="kb-hold-btn" onClick={() => setEditing(true)}>
        Reschedule
      </button>
      <button type="button" className="kb-hold-btn kb-hold-btn--primary" onClick={() => onResume?.(leadId)}>
        Resume Search
      </button>
    </div>
  )
}
