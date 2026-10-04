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
 * Whether a due timestamp is overdue relative to `now`. "Overdue" is a CALENDAR
 * DAY comparison: an action is overdue once its due DAY is behind today's day,
 * not the moment its due time passes.
 *
 * ── WHY DAY-LEVEL, NOT AN INSTANT COMPARISON ────────────────────────────────
 * This was `t < now.getTime()`, which disagreed with the CRM board and produced
 * a visible contradiction. Automatic workflow actions are DAY-scheduled: a new
 * lead's Contact Lead is due 9:00 AM local on its creation day
 * (lib/workflowEngine.ts → autoDueInDays(0)). A lead arriving at 2 PM therefore
 * had a due time three hours in the past, so the Companion showed it Overdue the
 * instant it landed, while the board showed it as Today — because the board's
 * urgencyOf (lib/nextActions.ts) normalises both sides to midnight.
 *
 * The board's rule is the correct one and the older one, so this now matches it:
 * one lead, one due state, wherever the locator happens to be looking.
 *
 * KNOWN CONSEQUENCE, accepted deliberately: a manual Task with a user-picked
 * time (3:00 PM today) no longer flips to Overdue at 3:01 PM — it stays Today
 * until tomorrow. That is not a regression against the board, which never flipped
 * it either; it is the two surfaces finally agreeing. Making time-specific tasks
 * overdue at their time is a separate product decision, and would need to change
 * both implementations together, not just this one.
 *
 * Day boundaries are resolved in `timeZone` when given (the same zone-aware,
 * DST-safe dayKeyInZone that formatDueDateTime already uses for Today/Tomorrow,
 * so the badge and the label can never disagree); omitted → runtime-local, which
 * is what the CRM board uses. A missing/invalid timestamp is not-overdue.
 */
export function isPastDue(
  dueAt: string | null | undefined,
  now: Date = new Date(),
  timeZone?: string,
): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  if (!Number.isFinite(due.getTime())) return false;
  // "YYYY-MM-DD" keys compare lexicographically === chronologically.
  return dayKeyInZone(due, timeZone) < dayKeyInZone(now, timeZone);
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
