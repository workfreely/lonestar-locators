/**
 * Shared display formatting for person names — the ONE formatter used across the
 * Agenda, Lead Card, Lead Panel, search, notifications, Google Calendar, Companion
 * and the demo workspace, so a client's name is never shown two different ways.
 * The stored value is NEVER modified; this only changes how a name is DISPLAYED.
 *
 * Conservative rules (see scripts/tests/format-name.test.ts):
 *   - Fixes ALL-lowercase and ALL-UPPERCASE words:  "maria" / "MARIA" → "Maria".
 *   - Capitalizes each sub-part around spaces, hyphens and apostrophes:
 *       "kevin o'brien"        → "Kevin O'Brien"
 *       "anna-marie smith"     → "Anna-Marie Smith"
 *       "mary jane de la cruz" → "Mary Jane De La Cruz"
 *   - PRESERVES a word that already has an interior capital (assumed intentional),
 *     so "McDonald", "DeShawn" and an already-correct "O'Brien" survive untouched.
 *
 * Idempotent. Deliberately conservative and NOT locale-aware: it does not infer
 * naming particles/prefixes. Known limitation — a name typed ALL-lowercase with an
 * intended interior capital ("macdonald") becomes "Macdonald"; typed with the
 * interior capital ("MacDonald") it is preserved. Reported rather than
 * over-engineered.
 */

// Capitalize the first letter of each run delimited by a space, hyphen, or
// apostrophe (straight or curly); lower-case the remaining letters of the run.
function titleCaseWord(word: string): string {
  return word.toLowerCase().replace(/(^|[\s'’-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

// A word whose letters are all a single case (all lower OR all upper) is safe to
// re-case; a word that already mixes cases is assumed intentional and left as-is.
function isUniformCase(word: string): boolean {
  const letters = word.replace(/[^A-Za-z]/g, "");
  if (!letters) return false;
  return letters === letters.toLowerCase() || letters === letters.toUpperCase();
}

export function formatPersonName(name: string | null | undefined): string {
  if (!name) return "";
  return String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (isUniformCase(word) ? titleCaseWord(word) : word))
    .join(" ");
}

/**
 * ── Locator Beast's ONE display-name rule ──────────────────────────────────
 *
 * A profile carries a LEGAL name (first_name / last_name — reserved for account
 * verification and identity) and an optional PREFERRED name, which is structured
 * into its own first/last parts. The rule is applied PER PART, so a preferred
 * given name composes with a legal surname:
 *
 *     display first = preferred first  ELSE legal first
 *     display last  = preferred last   ELSE legal last
 *
 * Legal: Jay Morris · Preferred: Jay / Morris   → "Jay Morris",  greeting "Jay"
 * Legal: Jay Morris · Preferred: Jay / —        → "Jay Morris",  greeting "Jay"
 * Legal: Jay Morris · Preferred: — / —          → "Jay Morris",  greeting "Jay"
 * Legal: Robert Vale · Preferred: Bob / —       → "Bob Vale",    greeting "Bob"
 *
 * Every surface (welcome banner, Smart Form, guest cards, notifications, Beast
 * Network, Companion) resolves names through these functions, so a name can
 * never be shown two different ways. Stored values are NEVER modified.
 */
export type PreferredNameParts = {
  preferredFirst?: string | null;
  preferredLast?: string | null;
  legalFirst?: string | null;
  legalLast?: string | null;
};

const pick = (...vals: Array<string | null | undefined>): string => {
  for (const v of vals) {
    const t = String(v ?? "").trim();
    if (t) return t;
  }
  return "";
};

/** Preferred given name, else legal given name. Title-cased. */
export function displayFirstName(p: PreferredNameParts): string {
  return formatPersonName(pick(p.preferredFirst, p.legalFirst));
}

/** Preferred surname, else legal surname. Title-cased. */
export function displayLastName(p: PreferredNameParts): string {
  return formatPersonName(pick(p.preferredLast, p.legalLast));
}

/**
 * The full name shown publicly — display first + display last, each resolved
 * independently. Returns "" when nothing is available, so callers can decide
 * their own fallback rather than being handed a placeholder.
 */
export function displayFullName(p: PreferredNameParts): string {
  return [displayFirstName(p), displayLastName(p)].filter(Boolean).join(" ");
}

/**
 * The name to GREET someone by — "Welcome to Locator Beast, Jay!". Always the
 * display FIRST name, never the surname and never the full legal name.
 *
 * Also accepts a plain string for callers that only hold an already-resolved
 * display name (a legacy free-text `preferred_name`, which may contain a full
 * name). In that case it takes the first whitespace-delimited token. Deliberately
 * not a second parser: no particle inference, no surname detection, no
 * reordering — and it composes formatPersonName() above, never its own casing.
 */
export function greetingName(input: string | null | undefined | PreferredNameParts): string {
  if (input && typeof input === "object") return displayFirstName(input);
  const first = String(input ?? "").trim().split(/\s+/).filter(Boolean)[0] ?? "";
  return formatPersonName(first);
}
