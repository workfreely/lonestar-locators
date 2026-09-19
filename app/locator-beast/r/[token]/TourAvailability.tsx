"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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

  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus the dialog, lock background scroll, and wire Escape (desktop) to close.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  const selectedDates = useMemo(() => Array.from(selected.keys()).sort(), [selected])
  const canSubmit = selectedDates.length > 0 && !submitting

  function toggleDate(dateStr: string) {
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
    setSubmitting(true)
    setError(null)
    const dates = selectedDates.map((date) => ({ date, windows: Array.from(selected.get(date)!) }))
    try {
      const res = await fetch("/api/r/tour-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, tourType, dates }),
      })
      if (!res.ok) throw new Error("failed")
      onSubmitted({ tourType, dates })
    } catch {
      setError("Something went wrong sending your availability. Please try again.")
      setSubmitting(false)
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
    <div className="lbr-modal-overlay" onMouseDown={onClose}>
      <div
        className="lbr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lbr-ta-title"
        tabIndex={-1}
        ref={dialogRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="lbr-modal-head">
          <div className="lbr-modal-grab" aria-hidden />
          <h2 id="lbr-ta-title" className="lbr-modal-title">Let&rsquo;s Schedule Your Tours</h2>
          <button type="button" className="lbr-modal-x" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="lbr-modal-body">
          <p className="lbr-ta-sub">Tell me when you&rsquo;re available and I&rsquo;ll coordinate the tour times for you.</p>

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
                  <div className="lbr-ta-day" key={d}>
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
      </div>
    </div>
  )
}
