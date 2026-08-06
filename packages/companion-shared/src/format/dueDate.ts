/**
 * Shared Next-Action DUE date/time formatter — ONE implementation for the CRM
 * lead panel and the Beast Companion so the two can never drift.
 *
 * Output (uppercase AM/PM, centered-dot separator between date and time):
 *   Today • 4:00 PM
 *   Tomorrow • 9:30 AM
 *   Sat, Aug 8 • 9:00 AM             (other date, current year)
 *   Sat, Aug 8, 2027 • 9:00 AM       (other date, a different year)
 *   Saturday, August 8 • 9:00 AM     (verbose — e.g. the CRM "Next Action" toast)
 *
 * This is DISPLAY ONLY — the stored timestamp is never mutated.
 *
 * Today / Tomorrow are decided on CALENDAR days in `timeZone` (an IANA zone),
 * never on UTC date boundaries. Omitting `timeZone` uses the runtime's local
 * zone, which is the CRM's historical behavior. `now` is injectable for tests
 * and for a fixed preview clock.
 *
 * DST-safe: "tomorrow" is pure calendar arithmetic on the zone-local day, so it
 * is independent of the 23-/24-/25-hour length of a transition day; the wall-
 * clock time is rendered by Intl in the target zone, which applies the correct
 * offset on either side of a transition.
 */
export interface DueDateFormatOptions {
  /** Long weekday + month (e.g. the CRM toast). Default: short. */
  verbose?: boolean;
  /** IANA time zone for Today/Tomorrow boundaries AND the rendered time. */
  timeZone?: string;
  /** Reference "now" for the Today/Tomorrow comparison. Default: new Date(). */
  now?: Date;
}

/** The zone-local calendar day of an instant, as "YYYY-MM-DD" (en-CA → ISO order). */
function dayKeyInZone(d: Date, timeZone?: string): string {
  return d.toLocaleDateString("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** Pure calendar +days on a "YYYY-MM-DD" key — offset-independent, so DST-safe. */
function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Wall-clock time in the zone, "h:mm AM/PM" (en-US → uppercase AM/PM). */
function timeInZone(d: Date, timeZone?: string): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
}

/**
 * Whether a due timestamp has already passed relative to `now`. "Overdue" is a
 * pure instant comparison (both sides are absolute instants), so it is
 * independent of time zone. A missing/invalid timestamp is treated as
 * not-overdue. Use this to derive Next-Action status from the due timestamp —
 * never from an unrelated priority flag (a future due can't be "Overdue").
 */
export function isPastDue(dueAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  const t = new Date(dueAt).getTime();
  return Number.isFinite(t) && t < now.getTime();
}

export function formatDueDateTime(dueAt: string, options: DueDateFormatOptions = {}): string {
  const { verbose, timeZone, now } = options;
  const due = new Date(dueAt);
  const ref = now ?? new Date();

  const dueKey = dayKeyInZone(due, timeZone);
  const todayKey = dayKeyInZone(ref, timeZone);
  const tomorrowKey = addDaysToKey(todayKey, 1);

  const time = timeInZone(due, timeZone);

  if (dueKey === todayKey) return `Today • ${time}`;
  if (dueKey === tomorrowKey) return `Tomorrow • ${time}`;

  // Include the year only when the due date falls in a different calendar year
  // than "now" (same-zone comparison) — otherwise omit it, matching the CRM.
  const sameYear = dueKey.slice(0, 4) === todayKey.slice(0, 4);
  const datePart = due.toLocaleDateString("en-US", {
    weekday: verbose ? "long" : "short",
    month: verbose ? "long" : "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone,
  });
  return `${datePart} • ${time}`;
}
