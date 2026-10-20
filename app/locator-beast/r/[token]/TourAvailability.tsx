"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  TOUR_TYPE_LABELS,
  TOUR_WINDOWS,
  TOUR_WINDOW_LABELS,
  type TourType,
  type TourWindow,
} from "@bc/companion-shared"

// The tour types offered in the modal. "either" is intentionally NOT offered anymore
// (In Person is the default), but it remains a valid stored/label value so previously
// submitted availability records that used "either" stay readable/backward-compatible.
const SELECTABLE_TOUR_TYPES: TourType[] = ["in_person", "virtual"]

/**
 * "Let's Schedule Your Tours" — the client's GENERAL availability, opened as a modal
 * (bottom-sheet on mobile, centered on desktop) right after Done Selecting Favorites,
 * or via Choose Tour Availability / Edit. Intentionally simple: tour type, one or more
 * FUTURE dates, and broad windows. It never asks for an exact appointment time and
 * never books a tour — the locator coordinates real appointments afterward through the
 * existing Schedule Tour workflow.
 */

export type Availability = { tourType: TourType; dates: { date: string; windows: TourWindow[] }[] }
export type InitialAvailability = Availability | null

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function labelForDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10))
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

export default function TourAvailabilityModal({
  token,
  initial,
  onClose,
  onSubmitted,
}: {
  token: string
  initial: InitialAvailability
  onClose: () => void
  onSubmitted: (a: Availability) => void
}) {
  const today = useMemo(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  }, [])
  const todayStr = ymd(today)

  // In Person is the default for a new submission. An existing "either" record maps to
  // In Person in the editor (a safe interpretation); the stored value is only changed
  // if the client actually resubmits.
  const [tourType, setTourType] = useState<TourType>(initial?.tourType === "virtual" ? "virtual" : "in_person")
  const [selected, setSelected] = useState<Map<string, Set<TourWindow>>>(() => {
    const m = new Map<string, Set<TourWindow>>()
    initial?.dates.forEach((d) => m.set(d.date, new Set(d.windows)))
    return m
  })
  const [view, setView] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * The availability the SERVER confirmed it stored. Set only on a 200 that carried ok:true, so
   * the thank-you screen is evidence of a save rather than of a tap — a 409 on a revoked share,
   * or a network failure, leaves this null and the client back on the form with the error.
   *
   * It is also what Done hands upward, so the summary the client returns to is the record the
   * server actually holds.
   */
  const [sent, setSent] = useState<Availability | null>(null)

  const dialogRef = useRef<HTMLDivElement>(null)
  /** The modal's own scroller. The page behind is locked, so this is the only thing that moves. */
  const bodyRef = useRef<HTMLDivElement>(null)
  /**
   * The date a tap just ADDED, held until the row for it has rendered.
   *
   * An explicit intent flag, not a derived effect: an effect watching `selected` would also fire
   * when a date is REMOVED, when a time window is toggled, and on any incidental re-render, and
   * the client would be yanked around for things they did not ask for. Only toggleDate's add
   * branch sets this, and the effect clears it immediately, so one tap produces at most one
   * scroll.
   */
  const pendingScrollRef = useRef<string | null>(null)
  /**
   * The in-flight latch for submit.
   *
   * A REF, not the `submitting` state, and not the button's disabled attribute. Both of those
   * only take effect after React re-renders, so several taps landing in the same frame all read
   * `submitting === false` from the same closure and each fires its own request — three taps
   * produced three POSTs before this existed. A ref is written synchronously, so the second tap
   * sees the first one's latch immediately.
   */
  const inFlightRef = useRef(false)
  /** The Done button, focused when the form it replaced disappears. */
  const doneBtnRef = useRef<HTMLButtonElement>(null)

  /**
   * Leave the modal. Once the server has confirmed, EVERY exit commits — Done, the X, Escape and
   * the overlay all report the saved availability upward. Dismissing a confirmed submission
   * without recording it would show the client "Choose Tour Availability" again for something
   * the server already stored, and invite them to send it twice.
   */
  const dismiss = useCallback(() => {
    if (sent) onSubmitted(sent)
    else onClose()
  }, [sent, onSubmitted, onClose])

  // Focus the dialog, lock background scroll, and wire Escape (desktop) to close.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKey)
    }
  }, [dismiss])

  /**
   * Move focus to Done when the confirmation replaces the form. Without this, focus is sitting
   * on the Send button at the moment that button is unmounted, which drops it to <body> — a
   * keyboard or screen-reader client is then stranded outside the dialog with no way back to
   * its only control. role="status" announces the message; this gives them the action.
   */
  useEffect(() => {
    if (sent) doneBtnRef.current?.focus()
  }, [sent])

  const selectedDates = useMemo(() => Array.from(selected.keys()).sort(), [selected])

  /**
   * Bring the day a client just picked into view.
   *
   * On a phone the calendar fills the modal, so "What times work best?" renders below the fold
   * and the client sees nothing happen — the sticky footer stays put and the section they need is
   * off-screen. This scrolls the MODAL'S OWN body to the row for the date they tapped.
   *
   * It top-aligns that row rather than using scrollIntoView: scrollIntoView walks every
   * scrollable ancestor, and top-aligning inside the body puts the row as far from the footer as
   * the container allows, so the chips cannot end up behind it. The scroll is also clamped by the
   * browser, so picking the last visible date simply scrolls to the end rather than overshooting.
   *
   * Nothing is selected or deselected here, and the calendar is untouched — the client can scroll
   * back up and add more dates exactly as before.
   */
  useEffect(() => {
    const date = pendingScrollRef.current
    if (!date) return
    pendingScrollRef.current = null
    const body = bodyRef.current
    const row = body?.querySelector<HTMLElement>(`[data-ta-day="${date}"]`)
    if (!body || !row) return
    const reduced = typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    const delta = row.getBoundingClientRect().top - body.getBoundingClientRect().top
    body.scrollTo({ top: body.scrollTop + delta - 12, behavior: reduced ? "auto" : "smooth" })
  }, [selectedDates])
  const canSubmit = selectedDates.length > 0 && !submitting

  function toggleDate(dateStr: string) {
    // The intent is recorded HERE, not inside the updater. A state updater must be pure — React
    // may call it twice or discard a render — so a ref written in there is not reliably the thing
    // the effect later reads. ADDING only: removing a date must not move the view, because the
    // client is looking at the calendar and the row they just dismissed is gone.
    if (!selected.has(dateStr)) pendingScrollRef.current = dateStr
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.set(dateStr, new Set<TourWindow>(["flexible"])) // sensible default: zero extra taps
      return next
    })
  }
  function toggleWindow(dateStr: string, w: TourWindow) {
    setSelected((prev) => {
      const next = new Map(prev)
      let set = new Set(next.get(dateStr) ?? [])
      if (w === "flexible") {
        // Flexible is mutually exclusive: selecting it clears Morning/Afternoon/Evening.
        set = new Set<TourWindow>(["flexible"])
      } else {
        // Selecting a specific window clears Flexible; Morning/Afternoon/Evening combine.
        set.delete("flexible")
        if (set.has(w)) {
          if (set.size > 1) set.delete(w) // keep at least one window
        } else {
          set.add(w)
        }
        if (set.size === 0) set = new Set<TourWindow>([w])
      }
      next.set(dateStr, set)
      return next
    })
  }

  async function submit() {
    // DUPLICATE GUARD — see inFlightRef. Checked and set in the same synchronous step, so a
    // burst of taps yields exactly one request; `sent` additionally stops a confirmed
    // submission ever being sent a second time.
    if (inFlightRef.current || sent) return
    inFlightRef.current = true
    setSubmitting(true)
    setError(null)
    const dates = selectedDates.map((date) => ({ date, windows: Array.from(selected.get(date)!) }))
    try {
      const res = await fetch("/api/r/tour-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, tourType, dates }),
      })
      // The route answers 409 with ok:false for a revoked/disabled share, which res.ok already
      // rejects; reading the body too means a 200 that did not actually store anything cannot
      // reach the thank-you screen either.
      const body = res.ok ? ((await res.json().catch(() => null)) as { ok?: boolean } | null) : null
      if (!res.ok || body?.ok !== true) throw new Error("failed")
      setSubmitting(false)
      setSent({ tourType, dates })
      // The latch stays CLOSED on success: `sent` now guards the path, and the form is gone.
    } catch {
      setError("Something went wrong sending your availability. Please try again.")
      setSubmitting(false)
      inFlightRef.current = false // a failure must be retryable
    }
  }

  // Month grid (leading blanks for weekday alignment).
  const grid = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1)
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < first.getDay(); i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d))
    return cells
  }, [view])
  const monthLabel = view.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  const atFirstMonth = view.getFullYear() === today.getFullYear() && view.getMonth() === today.getMonth()

  return (
    <div className="lbr-modal-overlay" onMouseDown={dismiss}>
      <div
        className="lbr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lbr-ta-title"
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* CONFIRMED. Replaces the form entirely rather than stacking on top of it: the client
            has finished, and leaving a live calendar behind a success panel invites a second
            submission of something already stored. Reuses the modal's own shell, body and
            footer-button styles — no new component, and Edit still reaches the same form from
            the summary underneath. */}
        {sent ? (
          <div className="lbr-ta-done" role="status" aria-live="polite">
            <svg className="lbr-ta-done-ic" viewBox="0 0 24 24" width="34" height="34" aria-hidden
                 fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12.4l2.8 2.8L16.2 9.4" />
            </svg>
            <h2 id="lbr-ta-title" className="lbr-ta-done-h">Thank You!</h2>
            <p className="lbr-ta-done-p">Your tour availability has been submitted.</p>
            <p className="lbr-ta-done-sub">
              I&rsquo;ll review your favorites and availability, then reach out to coordinate your tours.
            </p>
            <button type="button" className="lbr-ta-send lbr-ta-done-btn" onClick={dismiss} ref={doneBtnRef}>
              Done
            </button>
          </div>
        ) : (
        <>
        <div className="lbr-modal-head">
          <div className="lbr-modal-grab" aria-hidden />
          <h2 id="lbr-ta-title" className="lbr-modal-title">Let&rsquo;s Schedule Your Tours</h2>
          <button type="button" className="lbr-modal-x" onClick={dismiss} aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="lbr-modal-body" ref={bodyRef}>
          <div className="lbr-ta-field">
            <p className="lbr-ta-lbl">How would you like to tour?</p>
            <div className="lbr-ta-seg" role="radiogroup" aria-label="Tour type">
              {SELECTABLE_TOUR_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={tourType === t}
                  className={`lbr-ta-segbtn${tourType === t ? " is-on" : ""}`}
                  onClick={() => setTourType(t)}
                >
                  {TOUR_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="lbr-ta-field">
            <p className="lbr-ta-lbl">What days work for you?</p>
            <div className="lbr-ta-cal">
              <div className="lbr-ta-calhead">
                <button type="button" className="lbr-ta-nav" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} disabled={atFirstMonth} aria-label="Previous month">‹</button>
                <span className="lbr-ta-month">{monthLabel}</span>
                <button type="button" className="lbr-ta-nav" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} aria-label="Next month">›</button>
              </div>
              <div className="lbr-ta-dow">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i}>{d}</span>)}
              </div>
              <div className="lbr-ta-grid">
                {grid.map((d, i) => {
                  if (!d) return <span key={i} className="lbr-ta-cell is-blank" />
                  const ds = ymd(d)
                  const past = ds < todayStr
                  const on = selected.has(ds)
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`lbr-ta-cell${on ? " is-on" : ""}`}
                      disabled={past}
                      aria-pressed={on}
                      aria-label={labelForDate(ds)}
                      onClick={() => toggleDate(ds)}
                    >
                      {d.getDate()}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {selectedDates.length > 0 && (
            <div className="lbr-ta-field">
              <p className="lbr-ta-lbl">What times work best?</p>
              <div className="lbr-ta-days">
                {selectedDates.map((d) => (
                  <div className="lbr-ta-day" key={d} data-ta-day={d}>
                    <div className="lbr-ta-dayname">{labelForDate(d)}</div>
                    <div className="lbr-ta-chips">
                      {TOUR_WINDOWS.map((w) => {
                        const on = selected.get(d)!.has(w)
                        return (
                          <button
                            key={w}
                            type="button"
                            className={`lbr-ta-chip${on ? " is-on" : ""}`}
                            aria-pressed={on}
                            onClick={() => toggleWindow(d, w)}
                          >
                            {TOUR_WINDOW_LABELS[w]}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="lbr-ta-err">{error}</p>}
        </div>

        <div className="lbr-modal-foot">
          <button type="button" className="lbr-ta-send" onClick={submit} disabled={!canSubmit} aria-busy={submitting}>
            {submitting ? "Sending…" : "Send My Availability"}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  )
}
