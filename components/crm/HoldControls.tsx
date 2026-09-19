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
        <input
          type="date"
          className="kb-hold-date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
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
    <div className={`kb-hold-controls${size === "xs" ? " kb-hold-controls--xs" : ""}`} onClick={stop}>
      <button type="button" className="kb-hold-btn kb-hold-btn--primary" onClick={() => onResume?.(leadId)}>
        Resume Search
      </button>
      <button type="button" className="kb-hold-btn" onClick={() => setEditing(true)}>
        Reschedule
      </button>
    </div>
  )
}
