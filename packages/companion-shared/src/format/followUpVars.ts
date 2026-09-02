/**
 * Token VALUE derivation + clean missing-value handling (CP2.5).
 *
 * Produces the substitution map for the approved agent-facing variables from the
 * data the CRM/Companion already have on a lead + the signed-in agent. Pure and
 * dependency-free. Content only — reads nothing about the workflow and changes
 * no action_key/timing/stage logic.
 *
 * Cleanliness rules (per product direction):
 *   • Each agent-facing token is a BARE value — no leading/trailing spaces and no
 *     built-in punctuation. `{first_name}` → "Sarah", never " Sarah" / "Sarah,".
 *   • A missing source value renders as "" (empty), never "undefined"/"null".
 *   • Callers that render an agent-authored template run the result through
 *     `tidyRenderedMessage`, a NARROW deterministic cleanup (collapse repeated
 *     spaces, drop a space directly before ,.!?;:, trim ends) that removes the
 *     artifacts an empty token can leave. It is NOT prose rewriting.
 *
 * The default templates keep their own exact rendering via SYSTEM tokens
 * (`beds_phrase`, `move_suffix`) that carry the legacy conflation/connective, so
 * with no override every message stays byte-identical to before.
 */

const norm = (v: unknown): string => String(v ?? "").replace("-", "").trim();

export type FollowUpVarInput = {
  /** Client first name (already display-normalized by the caller). */
  firstName?: string | null;
  /** Signed-in agent's first name. */
  agentFirstName?: string | null;
  /** Stored beds value, e.g. "1" / "2" / "3+". */
  beds?: string | null;
  /** Stored baths value, e.g. "1" / "2" / "3+". */
  baths?: string | null;
  /** Stored property type, e.g. "Apartment" / "Studio" / "High-Rise". */
  propertyType?: string | null;
  /** Stored move date (any parseable form); only the month is used. */
  moveDate?: string | null;
};

/**
 * Build the full substitution map: the six approved agent-facing tokens (all
 * clean/bare) PLUS the two system tokens the default templates use.
 *
 * Agent-facing (bare, no spaces/punctuation):
 *   first_name, agent_first_name, move_month ("September"|""),
 *   beds ("2 bed"|""), baths ("2 bath"|""), property_type ("Apartment"|"")
 *
 * System-only (carry the legacy presentation so defaults stay byte-identical):
 *   beds_phrase ("studio"|"high-rise"|"2 bed"|""), move_suffix (" in September"|"")
 */
export function buildFollowUpTemplateVars(input: FollowUpVarInput): Record<string, string> {
  const bedsNorm = norm(input.beds); // "" when absent
  const bathsNorm = norm(input.baths);
  const propertyType = String(input.propertyType ?? "").trim();
  const monthName = input.moveDate
    ? new Date(input.moveDate).toLocaleString("en-US", { month: "long" })
    : "";

  // System token: the legacy conflated beds phrase (property type wins for
  // Studio/High-Rise), reproduced EXACTLY so the default intro is unchanged.
  const bedsPhrase =
    propertyType === "Studio"
      ? "studio"
      : propertyType === "High-Rise"
        ? "high-rise"
        : bedsNorm
          ? `${bedsNorm} bed`
          : "";
  // System token: the legacy conditional connective, reproduced EXACTLY.
  const moveSuffix = input.moveDate ? ` in ${monthName}` : "";

  return {
    // Agent-facing (clean/bare)
    first_name: String(input.firstName ?? ""),
    agent_first_name: String(input.agentFirstName ?? ""),
    move_month: monthName,
    beds: bedsNorm ? `${bedsNorm} bed` : "",
    baths: bathsNorm ? `${bathsNorm} bath` : "",
    property_type: propertyType,
    // System-only (preserve default rendering)
    beds_phrase: bedsPhrase,
    move_suffix: moveSuffix,
  };
}

/**
 * Narrow, deterministic cleanup for a rendered AGENT-authored message, so an
 * empty token can't leave malformed text. Only three transforms, applied once:
 *   1. collapse any run of spaces/tabs to a single space,
 *   2. remove a space immediately before , . ! ? ; :
 *   3. trim leading/trailing whitespace.
 * Newlines are preserved (multi-line templates keep their blank lines). This is
 * NOT prose rewriting — it never reorders, inserts, or rephrases words.
 */
export function tidyRenderedMessage(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+/gm, "")
    .trim();
}
