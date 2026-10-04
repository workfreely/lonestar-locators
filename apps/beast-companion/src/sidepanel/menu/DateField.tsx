import { useEffect, useMemo, useRef, useState } from "react";
import { formatDateDisplay } from "@bc/companion-shared";

/**
 * Date field + calendar for the Companion — the extension's port of the CRM's
 * DateTimePicker day grid (components/crm/DateTimePicker.tsx) in its `dateOnly`
 * mode.
 *
 * WHY A PORT AND NOT AN IMPORT. The side panel is a separate Vite build whose
 * tsconfig paths reach only `@/* → src/*` and `@bc/* → companion-shared`; it
 * cannot import from the main app's components/, and companion-shared is types,
 * contracts and formatters with no React in it at all. So "reuse the Locator
 * Beast calendar" means mirroring it here, which is exactly what TourTimeField
 * already does for the same picker's TIME row ("mirrors the CRM Add Task
 * DateTimePicker's time-selection UX"). This is the day-grid half of that same
 * mirror, and it is deliberately faithful: same leading-blank cell math, same
 * month nav, same selected/today treatments.
 *
 * DATE-ONLY, AND TIMEZONE-SAFE BY CONSTRUCTION. Every value in and out is a bare
 * "YYYY-MM-DD" composed from LOCAL date parts. No Date is ever serialised, and
 * toISOString() appears nowhere — it would render the previous day for anyone
 * behind UTC, which is the move_date bug this codebase has already paid for once.
 * The Date objects here exist only to do calendar arithmetic and never leave.
 */

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** Local date → "YYYY-MM-DD". The ONLY way a value leaves this component. */
function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" → a LOCAL Date (parsed by parts, never `new Date(iso)`). */
function parseIso(value: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function DateField({
  value,
  onChange,
  min,
  placeholder = "Pick a date",
  disabled = false,
  label,
}: {
  /** Committed value, "YYYY-MM-DD" or null. */
  value: string | null;
  /** Live-commit, like the CRM picker's onChange mode: fires on selection. */
  onChange: (next: string | null) => void;
  /** Earliest selectable day, "YYYY-MM-DD". Earlier days render disabled. */
  min?: string;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => parseIso(value), [value]);
  const today = useMemo(() => new Date(), []);
  const minDate = useMemo(() => parseIso(min ?? null), [min]);

  // The month shown in the grid, independent of the selection.
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = parseIso(value) ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  // Re-anchor the grid when reopened, so opening on a stored date shows that
  // date's month rather than wherever the user last browsed to.
  useEffect(() => {
    if (!open) return;
    const base = parseIso(value) ?? new Date();
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    return out;
  }, [year, month]);

  function pick(d: Date) {
    onChange(toIso(d));
    setOpen(false);
  }

  return (
    <div className="bc-cal" ref={rootRef}>
      {/* The whole field is the trigger — clicking anywhere on it opens the
          calendar, rather than only a small icon hit area. */}
      <button
        type="button"
        className={`bc-cal-trigger${value ? "" : " is-empty"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ? `${label}: ${value ? formatDateDisplay(value) : placeholder}` : undefined}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span className="bc-cal-value">{value ? formatDateDisplay(value) : placeholder}</span>
      </button>

      {open && (
        <div
          className="bc-cal-pop"
          role="dialog"
          aria-label={label ?? "Choose a date"}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            // Close only the calendar — the popover's own Escape handler must not
            // fire and tear down the whole menu underneath.
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <div className="bc-cal-nav">
            <button type="button" className="bc-cal-navbtn" aria-label="Previous month" onClick={() => setViewMonth(new Date(year, month - 1, 1))}>
              ‹
            </button>
            <div className="bc-cal-month">{MONTHS[month]} {year}</div>
            <button type="button" className="bc-cal-navbtn" aria-label="Next month" onClick={() => setViewMonth(new Date(year, month + 1, 1))}>
              ›
            </button>
          </div>

          <div className="bc-cal-grid bc-cal-weekdays">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="bc-cal-wd">{w}</div>
            ))}
          </div>

          <div className="bc-cal-grid">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} className="bc-cal-cell is-blank" />;
              const cellDate = new Date(year, month, d);
              const isSelected = !!selected && sameDay(cellDate, selected);
              const isToday = sameDay(cellDate, today);
              const tooEarly = !!minDate && cellDate < minDate && !sameDay(cellDate, minDate);
              return (
                <button
                  key={i}
                  type="button"
                  className={`bc-cal-cell${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                  disabled={tooEarly}
                  onClick={() => pick(cellDate)}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="bc-cal-foot">
            <button type="button" className="bc-cal-link" onClick={() => pick(new Date())}>
              Today
            </button>
            {value && (
              <button
                type="button"
                className="bc-cal-link"
                onClick={() => {
                  // An explicit clear — null, not an omission. The route treats
                  // the two differently on purpose.
                  onChange(null);
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
