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
 * The name to GREET someone by — "Welcome to Locator Beast, Jay!".
 *
 * Locator Beast's display rule is "preferred name wins, else legal first name",
 * and callers pass the already-resolved display name here. That resolved value
 * is not always a given name: Preferred Name is a free-text field, so an agent
 * who types their full name into it ("Jay Morris") would otherwise be greeted by
 * their full legal name. A greeting takes the FIRST token of whatever display
 * name it is given, then formats it with the one shared formatter above.
 *
 * Deliberately not a second parser: no particle/prefix inference, no surname
 * detection, no reordering. First whitespace-delimited token, title-cased.
 *   "Jay Morris" → "Jay"   "jay" → "Jay"   "Mary Jane Smith" → "Mary"   "" → ""
 */
export function greetingName(displayName: string | null | undefined): string {
  const first = String(displayName ?? "").trim().split(/\s+/).filter(Boolean)[0] ?? "";
  return formatPersonName(first);
}
