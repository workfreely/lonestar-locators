/**
 * The ONE sentence both surfaces show about a renter's reported criminal background.
 *
 * ── WHY IT IS SHARED ────────────────────────────────────────────────────────────────────────
 * The CRM's Credit Screening card and Beast Companion's pre-screening section describe the same
 * fact to the same agent. They already drifted once — the CRM composed "Felony (3 years)" while
 * the Companion showed the bare word — and the offense CATEGORY, which the Smart Form has
 * collected all along, appeared on neither. One function, two callers, no third wording.
 *
 * ── WHAT IT WILL NOT SAY ────────────────────────────────────────────────────────────────────
 * It reports what the renter answered and nothing more. It does not infer, rank, or conclude, and
 * it never turns a reported CHARGE into a conviction: the intake records a category, not a court
 * outcome, and no part of this product may present the two as the same thing.
 *
 * Silence stays silence. A missing background is null — the row simply does not draw — rather
 * than "None", which is a different answer a renter actually gave.
 */
export function criminalScreeningLine(input: {
  /** "Felony" | "Misdemeanor" | "None", verbatim from the form. */
  background?: string | null;
  /** The offense category: DWI, Drug Related, Assault, Theft / Fraud, Sex Offense, Other. */
  charge?: string | null;
  /** Age bucket, already gated by the caller to the matching background. */
  felonyAge?: string | null;
  misdemeanorAge?: string | null;
}): string | null {
  const t = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  const background = t(input.background);
  if (!background) return null;
  // "None" is a complete answer. A category or an age beside it would contradict it, so neither
  // is appended even if a stale value is still on the row.
  if (background === "None") return "None";

  const age =
    background === "Felony" ? t(input.felonyAge)
    : background === "Misdemeanor" ? t(input.misdemeanorAge)
    : null;

  return [background, t(input.charge), age].filter(Boolean).join(" · ");
}
