"use client"

import { useEffect, useState } from "react"
import { ARCHIVE_REASONS } from "@/lib/leads/archiveReasons"

// The single entry point behind the card's pause/trash action. First it asks
// WHAT to do with the lead — Put on Hold (pause the search, follow up later) or
// Archive (remove from active leads) — then reveals the fields for the chosen
// path. Put on Hold requires a Follow Up Date (no hold reason). Archive requires
// a reason, exactly as before. Both paths stay gated until valid.
type Mode = "choose" | "hold" | "archive"

export default function PauseOrArchiveDialog({
  open,
  leadName,
  onCancel,
  onPutOnHold,
  onArchive,
}: {
  open: boolean
  leadName?: string
  onCancel: () => void
  onPutOnHold: (followUpDate: string) => void
  onArchive: (reason: string) => void
}) {
  const [mode, setMode] = useState<Mode>("choose")
  const [reason, setReason] = useState("")
  const [followUpDate, setFollowUpDate] = useState("")

  // Reset to the choice screen every time the dialog opens.
  useEffect(() => {
    if (open) {
      setMode("choose")
      setReason("")
      setFollowUpDate("")
    }
  }, [open])

  if (!open) return null

  const firstName = leadName ? leadName.split(" ")[0] || leadName : "this lead"
  const nameEl = leadName ? (
    <span className="font-semibold text-[var(--crm-text-primary)]">{firstName}</span>
  ) : (
    "this lead"
  )
  // The Put on Hold state names the lead in the HEADING ("Pause or Archive Keyonta?");
  // the choice + archive states keep the generic title.
  const heading = mode === "hold" ? `Pause or Archive ${firstName}?` : "Pause or Archive Lead"

  const choiceBtn =
    "w-full flex flex-col items-start gap-0.5 text-left px-3.5 py-3 rounded-xl border transition-colors border-[var(--crm-border)] bg-[var(--crm-inset)] hover:bg-[var(--crm-card)] hover:border-[var(--kb-accent)]"

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-[var(--crm-panel)] rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-[var(--crm-text-primary)]">{heading}</h3>

        {mode === "choose" && (
          <>
            <p className="text-sm text-[var(--crm-text-secondary)] mt-1">What would you like to do with {nameEl}?</p>
            <div className="mt-4 space-y-2">
              <button type="button" className={choiceBtn} onClick={() => setMode("hold")}>
                <span className="text-[14px] font-semibold text-[var(--crm-text-primary)]">⏸ Put on Hold</span>
                <span className="text-[12.5px] text-[var(--crm-text-secondary)]">Pause their search and follow up later.</span>
              </button>
              <button type="button" className={choiceBtn} onClick={() => setMode("archive")}>
                <span className="text-[14px] font-semibold text-[var(--crm-text-primary)]">Archive Lead</span>
                <span className="text-[12.5px] text-[var(--crm-text-secondary)]">Remove them from your active leads.</span>
              </button>
            </div>
            <div className="flex justify-end mt-5">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-xl border border-[var(--crm-border)] text-sm font-medium text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {mode === "hold" && (
          <>
            <p className="text-sm text-[var(--crm-text-secondary)] mt-1">
              Your current stage and workflow will be preserved.
            </p>
            <label className="block mt-4">
              <span className="text-[11px] uppercase tracking-wide font-semibold text-[var(--crm-text-muted)]">
                Follow Up Date
              </span>
              {/* crm-native-date opts OUT of the marketing-site rule that stretches
                  the calendar-picker-indicator to fill the field (globals.css:288) —
                  without it the indicator, being position:absolute inset:0 on a
                  static input, resolves against the fixed modal backdrop and covers
                  the whole modal, painting a giant black square AND intercepting the
                  Back / Put on Hold clicks. */}
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                autoFocus
                className="crm-native-date mt-1 w-full text-[14px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-primary)] px-3 py-2"
              />
            </label>
            <div className="flex justify-between gap-3 mt-5">
              <button
                onClick={() => setMode("choose")}
                className="px-4 py-2 rounded-xl border border-[var(--crm-border)] text-sm font-medium text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => followUpDate && onPutOnHold(followUpDate)}
                disabled={!followUpDate}
                className="crm-cta px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                Put on Hold
              </button>
            </div>
          </>
        )}

        {mode === "archive" && (
          <>
            <p className="text-sm text-[var(--crm-text-secondary)] mt-1">Why are you archiving {nameEl}?</p>
            <div className="mt-4 space-y-1.5">
              {ARCHIVE_REASONS.map((r) => {
                const active = reason === r.value
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReason(r.value)}
                    className={
                      "w-full flex items-center gap-2.5 text-left text-[13px] font-medium px-3 py-2 rounded-lg border transition-colors " +
                      (active
                        ? "border-[var(--kb-accent)] bg-[var(--crm-inset)] text-[var(--crm-text-primary)]"
                        : "border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] hover:text-[var(--crm-text-primary)]")
                    }
                  >
                    <span
                      className={
                        "grid place-items-center w-4 h-4 rounded-full border-2 flex-none " +
                        (active ? "border-[var(--kb-accent)]" : "border-[var(--crm-border)]")
                      }
                    >
                      {active && <span className="w-2 h-2 rounded-full bg-[var(--kb-accent)]" />}
                    </span>
                    <span>{r.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex justify-between gap-3 mt-5">
              <button
                onClick={() => setMode("choose")}
                className="px-4 py-2 rounded-xl border border-[var(--crm-border)] text-sm font-medium text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => reason && onArchive(reason)}
                disabled={!reason}
                className="crm-cta px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                Archive Lead
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
