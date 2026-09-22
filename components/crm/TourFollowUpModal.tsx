"use client"

import { useEffect, useState } from "react"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"
import { TOUR_OUTCOMES, TOUR_OUTCOME_LABELS, type TourOutcome } from "@bc/companion-shared"
import { formatDueDateTime } from "@/lib/actionDisplay"
import { autoDueInDays } from "@/lib/workflow/autoDueDate"
import { localTourToUtc } from "@/lib/leads/tourFollowUp"
import DateTimePicker from "./DateTimePicker"

// Tour Follow-Up — a FAST workflow decision, not a form. "How did the tour go?"
// for ONE tour/property. Still Deciding / Other add a compact second step:
// "When should we follow up?" (Tomorrow · 2 Days · 3 Days · Pick a Date) →
// one dated manual "Follow Up". The parent runs the ONE canonical completion.

// Outcomes that ask "when should we follow up?" before completing.
const NEEDS_FOLLOW_UP: TourOutcome[] = ["still_deciding", "other"]

export default function TourFollowUpModal({
  open,
  onClose,
  propertyName,
  scheduledAt,
  timeZone,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  propertyName: string | null
  scheduledAt: string | null
  timeZone?: string | null
  onSubmit: (outcome: TourOutcome, extras: { followUpDueAt?: string | null; note?: string | null }) => void
}) {
  // "outcome" step → optional "followup" step (Still Deciding / Other).
  const [step, setStep] = useState<"outcome" | "followup">("outcome")
  const [pending, setPending] = useState<TourOutcome | null>(null)
  const [note, setNote] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickedLocal, setPickedLocal] = useState("") // "YYYY-MM-DDTHH:mm"

  // Reset every time the modal opens (a fresh tour/property each time).
  useEffect(() => {
    if (open) {
      setStep("outcome")
      setPending(null)
      setNote("")
      setPickerOpen(false)
      setPickedLocal("")
    }
  }, [open])

  if (!open) return null

  const tz = timeZone ?? undefined
  const context = scheduledAt ? formatDueDateTime(scheduledAt, { verbose: true, timeZone: tz }) : null

  function chooseOutcome(o: TourOutcome) {
    if (NEEDS_FOLLOW_UP.includes(o)) {
      setPending(o)
      setStep("followup")
      return
    }
    onSubmit(o, {})
  }

  function submitFollowUp(dueAt: string) {
    if (!pending) return
    onSubmit(pending, { followUpDueAt: dueAt, note: note.trim() || null })
  }

  const outcomeBtn =
    "w-full text-left text-[13.5px] font-semibold rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] px-3.5 py-2.5 text-[var(--crm-text-primary)] hover:border-[var(--crm-accent)] hover:bg-[var(--crm-card)] transition-colors"
  const quickBtn =
    "flex-1 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] px-3 py-2 text-[12.5px] font-semibold text-[var(--crm-text-primary)] hover:border-[var(--crm-accent)] hover:bg-[var(--crm-card)] transition-colors"

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-[380px] flex-col overflow-hidden rounded-2xl bg-[var(--crm-panel)] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--crm-border)] px-5 py-4">
          <div className="min-w-0">
            {/* Action · Property on ONE line, same size/weight (Last Action pattern). */}
            <h3 className="truncate text-[18px] font-bold text-[var(--crm-text-primary)]">
              Tour Follow-Up{propertyName ? ` · ${propertyName}` : ""}
            </h3>
            {context && <p className="mt-0.5 text-[12px] text-[var(--crm-text-muted)]">{context}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-none rounded-lg p-1.5 text-[var(--crm-text-muted)] transition-colors hover:bg-[var(--crm-card)] hover:text-[var(--crm-text-primary)]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {step === "outcome" ? (
          <div className="space-y-2.5 overflow-y-auto px-5 py-4">
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.1em] text-[var(--crm-text-secondary)]">How did the tour go?</p>
            <div className="space-y-2">
              {TOUR_OUTCOMES.map((o) => (
                <button key={o} type="button" className={outcomeBtn} onClick={() => chooseOutcome(o)}>
                  {TOUR_OUTCOME_LABELS[o]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto px-5 py-4">
            {pending === "other" && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--crm-text-secondary)]">Note (optional)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="What happened?"
                  className="w-full resize-y rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] px-3 py-2 text-[13px] leading-relaxed text-[var(--crm-text-primary)] outline-none focus:border-[var(--crm-accent)]"
                />
              </div>
            )}
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.1em] text-[var(--crm-text-secondary)]">When should we follow up?</p>
            <div className="flex gap-2">
              <button type="button" className={quickBtn} onClick={() => submitFollowUp(autoDueInDays(1, tz ?? DEFAULT_TIMEZONE))}>Tomorrow</button>
              <button type="button" className={quickBtn} onClick={() => submitFollowUp(autoDueInDays(2, tz ?? DEFAULT_TIMEZONE))}>2 Days</button>
              <button type="button" className={quickBtn} onClick={() => submitFollowUp(autoDueInDays(3, tz ?? DEFAULT_TIMEZONE))}>3 Days</button>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="w-full rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] px-3 py-2 text-left text-[12.5px] font-semibold text-[var(--crm-text-primary)] hover:border-[var(--crm-accent)] hover:bg-[var(--crm-card)] transition-colors"
              >
                Pick a Date…
              </button>
              {pickerOpen && (
                <DateTimePicker
                  value={pickedLocal}
                  compact
                  onApply={(v) => {
                    setPickedLocal(v)
                    setPickerOpen(false)
                    const [d, t] = v.split("T")
                    if (d && t) submitFollowUp(localTourToUtc(d, t, tz))
                  }}
                  onCancel={() => setPickerOpen(false)}
                />
              )}
            </div>
          </div>
        )}

        {/* Footer — Back appears only on the follow-up step; Cancel always. */}
        <div className="flex items-center justify-between gap-2 border-t border-[var(--crm-border)] px-5 py-3">
          {step === "followup" ? (
            <button type="button" onClick={() => setStep("outcome")} className="text-[12.5px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]">
              ← Back
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--crm-border)] px-4 py-2 text-[13px] font-semibold text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
