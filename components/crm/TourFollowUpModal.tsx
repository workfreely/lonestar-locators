"use client"

import { useEffect, useState } from "react"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"
import { TOUR_OUTCOMES, TOUR_OUTCOME_LABELS, type TourOutcome } from "@bc/companion-shared"
import { formatDueDateTime } from "@/lib/actionDisplay"
import { autoDueInDays, type WorkHours } from "@/lib/workflow/autoDueDate"
import {
  localTourToUtc,
  tourFollowUpTitle,
  tourFollowUpQuestion,
  WAITING_FOR_REPLY,
  type TourFollowUpKey,
  type TourFollowUpStatus,
} from "@/lib/leads/tourFollowUp"
import DateTimePicker from "./DateTimePicker"

// Tour Follow-Up — a FAST workflow decision, not a form, for ONE tour/property.
//
// ONE modal serves all three rungs. The outcome choices never change — a client who
// becomes ready on the 2nd attempt must still reach Ready to Apply in one tap — but
// the QUESTION is contextual, because by the 2nd attempt the tour has already been
// reported on:
//   1st  "How did the tour go?"
//   2nd  "Have they made a decision about the apartment?"
//   3rd  "Are they still considering the apartment?"
//
// Still Deciding / Other / Waiting for Reply reveal "When should we follow up
// again?" (Tomorrow · 2 Days · 3 Days · Pick a Date) IN PLACE, beneath the choices —
// status and date stay on one screen, so the locator can see both before
// confirming. That date schedules the NEXT NUMBERED RUNG — an outreach attempt,
// not another tour visit.
//
// RESPONSIVE PRESENTATION ONLY — one component, one set of choices, one workflow:
//   ≥ sm  the four quick dates sit on one row and every outcome label is one line.
//   < sm  the three day shortcuts are hidden and the picker is the only control,
//         because four buttons cannot share a 375px row without clipping. The
//         picker reaches every date the shortcuts do, so nothing is lost.
//
// canScheduleNext false = the ladder ends here. No date is offered, because nothing
// would be created with it and offering one would promise a 4th step that does not
// exist. Waiting for Reply is still OFFERED on the 3rd — the client genuinely may
// not have answered — it simply creates nothing: see submit().
//
// NOTHING is submitted by selecting. One Confirm button commits, so a modal opened
// by a confirmed send (which pre-selects Waiting for Reply) and then dismissed
// records nothing at all.

// Statuses that ask "when should we follow up again?" before completing.
const NEEDS_FOLLOW_UP: TourFollowUpStatus[] = ["still_deciding", "other", WAITING_FOR_REPLY]

// DISPLAY ONLY, and only here. "Wants Another Tour" is the one label too long for a
// half-width cell, and it is the shortest honest way to say it. The key, the plan it
// maps to and TOUR_OUTCOME_LABELS (what every other surface shows) are untouched.
const MODAL_OUTCOME_LABELS: Partial<Record<TourOutcome, string>> = { wants_another_tour: "Touring Again" }
const labelFor = (o: TourOutcome) => MODAL_OUTCOME_LABELS[o] ?? TOUR_OUTCOME_LABELS[o]

export default function TourFollowUpModal({
  open,
  onClose,
  propertyName,
  scheduledAt,
  timeZone,
  workHours,
  rung = "tour_follow_up",
  canScheduleNext = true,
  defaultWaitingForReply = false,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  propertyName: string | null
  scheduledAt: string | null
  timeZone?: string | null
  workHours?: WorkHours
  /** Which rung is being completed. Drives the heading and the question. */
  rung?: TourFollowUpKey
  /** Is there a further rung to schedule once this one completes? */
  canScheduleNext?: boolean
  /** True ONLY when the Companion confirmed "Yes, Sent" — pre-selects Waiting for
   *  Reply. Pre-selection is not submission; Confirm still has to be pressed. */
  defaultWaitingForReply?: boolean
  onSubmit: (status: TourFollowUpStatus, extras: { followUpDueAt?: string | null; note?: string | null }) => void
}) {
  // One screen: a sticky selection, and the date section revealed beneath it.
  const [pending, setPending] = useState<TourFollowUpStatus | null>(null)
  const [dueAt, setDueAt] = useState<string | null>(null)
  const [dueLabel, setDueLabel] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickedLocal, setPickedLocal] = useState("") // "YYYY-MM-DDTHH:mm"

  // Reset every time the modal opens (a fresh tour/property each time). A send-
  // confirmed open starts on Waiting for Reply; every other open starts on nothing.
  useEffect(() => {
    if (open) {
      setPending(defaultWaitingForReply ? WAITING_FOR_REPLY : null)
      setDueAt(null)
      setDueLabel(null)
      setNote("")
      setPickerOpen(false)
      setPickedLocal("")
    }
  }, [open, defaultWaitingForReply])

  if (!open) return null

  const tz = timeZone ?? undefined
  const context = scheduledAt ? formatDueDateTime(scheduledAt, { verbose: true, timeZone: tz }) : null

  // Offer a date only when there is a rung left to put it on. On the last rung
  // nothing would be created with one, so none is shown.
  const wantsDate = pending != null && NEEDS_FOLLOW_UP.includes(pending) && canScheduleNext
  // Waiting for Reply on the LAST rung creates nothing and completes nothing: the
  // attempt went out and the client has not answered, which the text_sent event
  // already records. Confirm simply closes. Pause Search is a separate workflow.
  const ladderEndsWaiting = pending === WAITING_FOR_REPLY && !canScheduleNext
  const canConfirm = pending != null && (!wantsDate || dueAt != null)

  function pick(status: TourFollowUpStatus) {
    setPending(status)
    // A date already chosen stays chosen while switching between dated statuses;
    // moving to one that takes no date discards it so it cannot be submitted.
    if (!NEEDS_FOLLOW_UP.includes(status)) {
      setDueAt(null)
      setDueLabel(null)
      setPickerOpen(false)
    }
  }

  function chooseDate(iso: string, label: string) {
    setDueAt(iso)
    setDueLabel(label)
    setPickerOpen(false)
  }

  function confirm() {
    if (!pending || !canConfirm) return
    if (ladderEndsWaiting) {
      onClose()
      return
    }
    onSubmit(pending, {
      followUpDueAt: wantsDate ? dueAt : null,
      note: note.trim() || null,
    })
  }

  // Selected vs not. Same base as before; the accent border/ring marks the choice,
  // because selecting no longer submits and has to read as a held state.
  const outcomeBtn = (on: boolean) =>
    [
      "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2.5 text-left text-[13px] font-semibold transition-colors sm:gap-2.5 sm:px-3 sm:text-[13.5px]",
      on
        ? "border-[var(--crm-accent)] bg-[var(--crm-card)] text-[var(--crm-text-primary)]"
        : "border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-primary)] hover:border-[var(--crm-accent)] hover:bg-[var(--crm-card)]",
    ].join(" ")
  const quickBtn = (on: boolean) =>
    [
      // flex-1 + basis-auto lets the four share one row at their natural widths;
      // whitespace-nowrap means a label clips rather than wraps if that ever fails,
      // which the layout test would catch.
      "flex-1 basis-auto whitespace-nowrap rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors",
      on
        ? "border-[var(--crm-accent)] bg-[var(--crm-card)] text-[var(--crm-text-primary)]"
        : "border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-primary)] hover:border-[var(--crm-accent)] hover:bg-[var(--crm-card)]",
    ].join(" ")
  const Dot = ({ on }: { on: boolean }) => (
    <span
      aria-hidden
      className={[
        "flex-none rounded-full border-2 transition-colors",
        on ? "h-3.5 w-3.5 border-[var(--crm-accent)] bg-[var(--crm-accent)]" : "h-3.5 w-3.5 border-[var(--crm-border)] bg-transparent",
      ].join(" ")}
    />
  )

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      {/* 540px is measured, not chosen. The heading gets whatever the padding
          (42.5px), the gap (12.75px) and the close button (30px) leave it: 454.75px.
          "2nd Tour Follow-Up · Tin Top Flats at the Creamery" renders 435px wide at
          18px bold, so it sits on one line with ~20px to spare. A longer name
          truncates with an ellipsis — the heading never wraps. */}
      <div className="flex max-h-[88vh] w-full max-w-[540px] flex-col overflow-hidden rounded-2xl bg-[var(--crm-panel)] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--crm-border)] px-5 py-4">
          <div className="min-w-0">
            {/* Action · Property on ONE line, same size/weight (Last Action pattern). */}
            <h3 className="truncate text-[18px] font-bold text-[var(--crm-text-primary)]">
              {tourFollowUpTitle(rung)}{propertyName ? ` · ${propertyName}` : ""}
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

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {/* STATUS — Waiting for Reply first, spanning both columns: after a
              confirmed send it is the usual answer, and it is the one option that
              records no decision, so it reads before the six that do. The six
              canonical outcomes follow in their exact declared order, filled
              row-major so the two columns do not reorder them:
                Waiting for Reply  ← spans both
                Ready to Apply   Still Deciding
                Touring Again    Didn't Like It
                Didn't Tour      Other */}
          <div className="space-y-2.5">
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.1em] text-[var(--crm-text-secondary)]">{tourFollowUpQuestion(rung)}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={pending === WAITING_FOR_REPLY}
                className={`col-span-2 ${outcomeBtn(pending === WAITING_FOR_REPLY)}`}
                onClick={() => pick(WAITING_FOR_REPLY)}
              >
                <Dot on={pending === WAITING_FOR_REPLY} />
                <span className="min-w-0 leading-tight sm:whitespace-nowrap">Waiting for Reply</span>
              </button>
              {TOUR_OUTCOMES.map((o) => (
                <button key={o} type="button" aria-pressed={pending === o} className={outcomeBtn(pending === o)} onClick={() => pick(o)}>
                  <Dot on={pending === o} />
                  <span className="min-w-0 leading-tight sm:whitespace-nowrap">{labelFor(o)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Note — unchanged, still Other only. */}
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

          {/* SCHEDULING — same four choices, same autoDueInDays math, now one
              wrapping row beneath the status so both stay on screen together. */}
          {wantsDate && (
            <div className="space-y-2.5 border-t border-[var(--crm-border)] pt-4">
              <p className="text-[12.5px] font-semibold uppercase tracking-[0.1em] text-[var(--crm-text-secondary)]">When should we follow up again?</p>
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                <button type="button" className={`hidden sm:block ${quickBtn(dueLabel === "Tomorrow")}`} onClick={() => chooseDate(autoDueInDays(1, tz ?? DEFAULT_TIMEZONE, workHours), "Tomorrow")}>Tomorrow</button>
                <button type="button" className={`hidden sm:block ${quickBtn(dueLabel === "2 Days")}`} onClick={() => chooseDate(autoDueInDays(2, tz ?? DEFAULT_TIMEZONE, workHours), "2 Days")}>2 Days</button>
                <button type="button" className={`hidden sm:block ${quickBtn(dueLabel === "3 Days")}`} onClick={() => chooseDate(autoDueInDays(3, tz ?? DEFAULT_TIMEZONE, workHours), "3 Days")}>3 Days</button>
                <button type="button" className={quickBtn(dueLabel === "Pick a Date")} onClick={() => setPickerOpen((v) => !v)}>Pick a Date…</button>
              </div>
              {pickerOpen && (
                <DateTimePicker
                  value={pickedLocal}
                  compact
                  onApply={(v) => {
                    setPickedLocal(v)
                    const [d, t] = v.split("T")
                    if (d && t) chooseDate(localTourToUtc(d, t, tz), "Pick a Date")
                  }}
                  onCancel={() => setPickerOpen(false)}
                />
              )}
              {dueAt && (
                <p className="text-[12px] text-[var(--crm-text-muted)]">
                  Next follow-up {formatDueDateTime(dueAt, { verbose: true, timeZone: tz })}. Scheduling a reminder does not send another message.
                </p>
              )}
            </div>
          )}

          {/* The 3rd rung's Waiting for Reply: honest about creating nothing. */}
          {ladderEndsWaiting && (
            <p className="border-t border-[var(--crm-border)] pt-4 text-[12px] leading-relaxed text-[var(--crm-text-muted)]">
              The 3rd follow-up was sent and is already recorded. Nothing further is scheduled —
              this attempt stays open while you wait.
            </p>
          )}
        </div>

        {/* Footer — one Confirm. Selecting a status never submits on its own. */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--crm-border)] px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--crm-border)] px-4 py-2 text-[13px] font-semibold text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className="rounded-lg bg-[var(--crm-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--crm-accent-contrast,#fff)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
