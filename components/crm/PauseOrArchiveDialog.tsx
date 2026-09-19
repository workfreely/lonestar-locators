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
  // The heading is the modal's only question — it changes per step so no redundant
  // subtitle is needed: the choice asks Pause-or-Archive, then each branch restates
  // the specific decision (Put on Hold / archiving).
  const heading =
    mode === "hold"
      ? `Put ${firstName} on Hold?`
      : mode === "archive"
        ? `Why are you archiving ${firstName}?`
        : `Pause or Archive ${firstName}?`

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
              Your client&apos;s current stage will be preserved.
            </p>
            <label className="block mt-4">
              <span className="text-[11px] uppercase tracking-wide font-semibold text-[var(--crm-text-muted)]">
                Follow Up Date
              </span>
              {/* Date field affordance (see globals.css .lb-date-native):
                  • lb-date-native replaces the marketing rule's full-field indicator
                    (which, on a static input, escaped to the fixed modal backdrop and
                    painted a giant click-blocking overlay) with a normal small trailing
                    calendar icon at an EXPLICIT size — crm-native-date's width:auto
                    collapsed it to ~0 (an invisible icon = "nothing there").
                  • [color-scheme:dark] renders the native icon + picker for the dark
                    modal so the glyph is light/visible.
                  • onClick → showPicker() opens Chrome's native picker on a click
                    ANYWHERE in the field, not only the trailing icon. */}
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker?.() } catch { /* not supported / already open */ } }}
                autoFocus
                className="lb-date-native [color-scheme:dark] mt-1 w-full text-[14px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-primary)] px-3 py-2"
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
            {/* The heading ("Why are you archiving {FirstName}?") is the only prompt —
                no subtitle. Reasons follow immediately. */}
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
