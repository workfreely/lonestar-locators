/**
 * Shared 12-hour ↔ 24-hour time-selection helpers — ONE implementation for the
 * CRM DateTimePicker and the Beast Companion Tour Time picker so the two can
 * never drift on how a chosen hour/minute/AM-PM becomes a stored "HH:mm".
 *
 * DISPLAY + PARSING ONLY — no dates, no timezones (a wall-clock "HH:mm" is what
 * both surfaces collect; conversion to a UTC instant happens elsewhere).
 */

const pad = (n: number) => String(n).padStart(2, "0");

export type Period = "AM" | "PM";

/** A 12-hour selection (hour 1-12, minute 0-59, AM/PM). */
export interface TimeParts {
  hour12: number;
  minute: number;
  period: Period;
}

/** The sensible default both surfaces open on for a new appointment. */
export const DEFAULT_TIME_PARTS: TimeParts = { hour12: 9, minute: 0, period: "AM" };
export const DEFAULT_TIME_VALUE = "09:00"; // to24Hour(DEFAULT_TIME_PARTS)

/** 12-hour selection → 24-hour "HH:mm" (e.g. 1:00 PM → "13:00", 12:00 AM → "00:00"). */
export function to24Hour(hour12: number, minute: number, period: Period): string {
  let h24 = hour12 % 12; // 12 → 0
  if (period === "PM") h24 += 12; // 0-11 → 12-23
  return `${pad(h24)}:${pad(minute)}`;
}

/**
 * 24-hour "HH:mm" → 12-hour parts. Anything unparseable falls back to the shared
 * 9:00 AM default so a picker never opens on a blank/NaN state.
 */
export function from24Hour(value: string): TimeParts {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
  if (!m) return { ...DEFAULT_TIME_PARTS };
  const h24 = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(h24) || h24 < 0 || h24 > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return { ...DEFAULT_TIME_PARTS };
  }
  const hour12 = h24 % 12 || 12; // 0 → 12, 13 → 1
  const period: Period = h24 >= 12 ? "PM" : "AM";
  return { hour12, minute, period };
}

/** 24-hour "HH:mm" → human label "9:00 AM". Empty/invalid → "". */
export function formatTimeLabel(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
  if (!m) return "";
  const { hour12, minute, period } = from24Hour(value);
  return `${hour12}:${pad(minute)} ${period}`;
}
