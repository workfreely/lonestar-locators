// Follow-Up Agent — Phase 1 PACING (pure, deterministic time math).
//
// Trigger determines the DAY. Communication window determines the PERIOD. Pacing
// determines the exact instant. The final gate decides whether it sends at all.
// Scheduled times are ELIGIBILITY times, not guaranteed send timestamps.

// HARD global quiet-hours invariant (client-local): NO automated SMS may be
// transmitted before 09:00 or at/after 21:00, for EVERY sequence family including
// event-driven messages. Allowed window is [09:00, 21:00). This is stricter than,
// and independent of, the routine morning window below.
export const ALLOWED_START_MIN = 9 * 60 // 09:00 — first allowed minute
export const ALLOWED_END_MIN = 21 * 60 // 21:00 — first DISALLOWED minute (at/after = quiet)

// Routine follow-up morning window, client-local (a NARROWER preferred band that
// already sits inside the allowed hours above).
export const MORNING_START_MIN = 9 * 60 // 09:00
export const MORNING_END_MIN = 10 * 60 + 30 // 10:30

// Same-client New-Lead double-text spacing: randomized ~30–45s.
export const DOUBLE_TEXT_MIN_MS = 30_000
export const DOUBLE_TEXT_MAX_MS = 45_000

// Cross-client routine send jitter: ~3–7 minutes apart (never a 9:00 blast).
export const INTER_CLIENT_MIN_MS = 3 * 60_000
export const INTER_CLIENT_MAX_MS = 7 * 60_000

// Done-Selecting grace period before the first evaluation.
export const DONE_SELECTING_GRACE_MS = 10 * 60_000

// Default reactivation lead time for a Future-Move client who chooses to wait.
// The client's explicit instruction (a specific timeframe/date) overrides this.
export const FUTURE_MOVE_REACTIVATION_DAYS_BEFORE = 90

function randBetween(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs))
}
export function doubleTextSpacingMs(): number {
  return randBetween(DOUBLE_TEXT_MIN_MS, DOUBLE_TEXT_MAX_MS)
}
export function interClientJitterMs(): number {
  return randBetween(INTER_CLIENT_MIN_MS, INTER_CLIENT_MAX_MS)
}

/**
 * Cross-client send stagger: the next dispatch slot at/after `nowMs`, placed a
 * 3–7 min gap beyond the previously-scheduled send (`afterMs`, 0 = none). Keeps
 * different clients from becoming claimable at the same instant. NOT used for the
 * same-client New-Lead Text 1 → Text 2 pair (that is an exact 30s, set directly).
 */
export function nextCrossClientSlotMs(afterMs: number, nowMs: number): number {
  if (!afterMs) return nowMs // first send goes immediately
  return Math.max(nowMs, afterMs + interClientJitterMs())
}

// ── Local wall-clock helpers (timezone-correct without extra deps) ────────────
// Uses Intl to read the wall-clock minute-of-day and weekday in the lead's tz.

function localParts(date: Date, timeZone: string): { minuteOfDay: number; weekday: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  const hour = parseInt(parts.hour === "24" ? "0" : parts.hour, 10)
  const minute = parseInt(parts.minute, 10)
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    minuteOfDay: hour * 60 + minute,
    weekday: wdMap[parts.weekday] ?? 0,
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

/** Is `date` inside the client-local routine morning window (09:00–10:30)? */
export function withinMorningWindow(date: Date, timeZone: string): boolean {
  const { minuteOfDay } = localParts(date, timeZone)
  return minuteOfDay >= MORNING_START_MIN && minuteOfDay <= MORNING_END_MIN
}

/**
 * HARD quiet-hours check (client-local): true only inside [09:00, 21:00). This is
 * the universal invariant — before 09:00 and at/after 21:00 are QUIET for every
 * family, including event-driven messages. Time is evaluated in the CLIENT's zone
 * (`timeZone`), never server or locator device time.
 */
export function withinAllowedHours(date: Date, timeZone: string): boolean {
  const { minuteOfDay } = localParts(date, timeZone)
  return minuteOfDay >= ALLOWED_START_MIN && minuteOfDay < ALLOWED_END_MIN
}

/**
 * The next client-local instant at which sending is allowed, at/after `from`:
 *   • already allowed → `from`;
 *   • before 09:00 → today 09:00;
 *   • at/after 21:00 → tomorrow 09:00.
 * An event-triggered message that becomes eligible during quiet hours is deferred
 * to this instant, where the FULL deterministic state/conversation check runs
 * again — never a blind overnight release.
 */
export function nextAllowedTime(from: Date, timeZone: string): string {
  if (withinAllowedHours(from, timeZone)) return from.toISOString()
  const { minuteOfDay } = localParts(from, timeZone)
  if (minuteOfDay < ALLOWED_START_MIN) return atLocalMinute(from, ALLOWED_START_MIN, timeZone)
  const next = new Date(from)
  next.setUTCDate(next.getUTCDate() + 1)
  return atLocalMinute(next, ALLOWED_START_MIN, timeZone)
}

/** Is `date` on a weekend in the client's local zone? */
export function isLocalWeekend(date: Date, timeZone: string): boolean {
  const { weekday } = localParts(date, timeZone)
  return weekday === 0 || weekday === 6
}

/**
 * Add `n` BUSINESS days to an ISO datetime, in the given tz — weekends do not
 * count. Returns a Date at the same local time-of-day, `n` business days later.
 * Used for the LOCKED Application-Status timing (3 business days after applied_at).
 */
export function addBusinessDays(fromIso: string, n: number, timeZone: string): Date {
  const d = new Date(fromIso)
  let added = 0
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (!isLocalWeekend(d, timeZone)) added++
  }
  return d
}

/**
 * The next routine-morning ELIGIBILITY instant at/after `from`. If `from` is
 * already before today's window close, today's 09:00 (local) is used; if inside
 * or past the window, the next day's 09:00. Returned as an ISO string anchored to
 * the window START — pacing jitter is applied later by the dispatcher.
 */
export function nextMorningEligible(from: Date, timeZone: string): string {
  // Walk forward day-by-day to the first day whose 09:00 local is >= from.
  const probe = new Date(from)
  for (let i = 0; i < 8; i++) {
    const { minuteOfDay } = localParts(probe, timeZone)
    // If we're before the window on this calendar day, today qualifies.
    if (i === 0 && minuteOfDay < MORNING_START_MIN) {
      return atLocalMinute(probe, MORNING_START_MIN, timeZone)
    }
    if (i > 0) {
      return atLocalMinute(probe, MORNING_START_MIN, timeZone)
    }
    probe.setUTCDate(probe.getUTCDate() + 1)
  }
  return atLocalMinute(probe, MORNING_START_MIN, timeZone)
}

/** Construct an ISO instant for the given local minute-of-day on `date`'s local
 *  calendar day, in `timeZone`. Robust to DST via a single offset correction. */
function atLocalMinute(date: Date, minuteOfDay: number, timeZone: string): string {
  const { ymd } = localParts(date, timeZone)
  const [y, m, d] = ymd.split("-").map((v) => parseInt(v, 10))
  const hh = Math.floor(minuteOfDay / 60)
  const mm = minuteOfDay % 60
  // Guess UTC == local, then correct by the tz offset observed at that guess.
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0))
  const { minuteOfDay: guessLocalMin } = localParts(guess, timeZone)
  const deltaMin = guessLocalMin - minuteOfDay
  return new Date(guess.getTime() - deltaMin * 60_000).toISOString()
}
