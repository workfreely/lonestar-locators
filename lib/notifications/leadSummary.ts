// AI LEAD SUMMARY — the plain-English sentence at the top of the agent's new-lead email.
//
// Pure and deterministic: no model call, no network. The agent reads this to decide whether to
// pick up the phone, so it has to be true of the submission and nothing more.
//
// ── WHAT WENT WRONG BEFORE ──────────────────────────────────────────────────────────────────
// The old narrative always commented on income — "…though income was not listed." — but the
// Smart Lead Form never ASKS for income. So every lead carried a negative clause about a field
// the renter was never given the chance to fill, which reads as a qualification concern the
// submission does not support.
//
// ── THE RULE THIS NOW FOLLOWS ───────────────────────────────────────────────────────────────
// ABSENCE IS NOT A SIGNAL. A field that was not supplied is simply not mentioned. The summary
// describes what the renter actually told us, in the order an agent cares about it, and says
// nothing about what they did not. A concern is raised only when a submitted value supports it.
//
// Credit is always described as REPORTED, because it is: the renter selected it on a form and
// nothing has verified it.

export type LeadSummaryInput = {
  property_type?: string | null
  city?: string | null
  beds?: string | number | null
  desired_rent?: string | null
  move_date?: string | null
  credit_score?: string | number | null
  income?: string | null
}

const clean = (v: unknown): string => (v == null ? "" : String(v).trim())

/** "a high-rise" / "an apartment" — article chosen from the sound, not a hardcoded list. */
function withArticle(noun: string): string {
  const n = noun.trim()
  if (!n) return ""
  return /^[aeiou]/i.test(n) ? `an ${n}` : `a ${n}`
}

/**
 * The narrative sentence(s).
 *
 * `moveWindow` is passed in rather than recomputed so this stays pure and the email keeps using
 * its own existing window logic — the wording changes, the classification does not.
 */
export function buildLeadSummary(lead: LeadSummaryInput, moveWindow: string | null): string {
  const type = clean(lead.property_type)
  const city = clean(lead.city)
  const beds = clean(lead.beds)
  const rent = clean(lead.desired_rent)
  const win = clean(moveWindow)

  // ── Sentence 1: what they are looking for, most useful details first.
  // "Open to All" is not a kind of home, it is the absence of a preference — so it cannot take
  // an article. "looking for an open to all in San Antonio" was the sentence that gave it one.
  // The stored property_type is untouched; only this sentence knows the difference.
  const openToAll = /^open to all$/i.test(type)
  const what = type ? withArticle(type.toLowerCase()) : "housing"
  let first = openToAll ? "This lead is open to all property types" : `This lead is looking for ${what}`
  if (city) first += ` in ${city}`
  const extras: string[] = []
  if (beds) extras.push(`${beds} bed${beds === "1" ? "" : "s"}`)
  if (rent) extras.push(`around ${rent}`)
  if (extras.length) first += ` (${extras.join(", ")})`
  if (win) first += `, with a move-in date within ${win}`
  first += "."

  const sentences = [first]

  // ── Sentence 2: credit, ONLY when the renter reported a score. Always "reported", never
  //    phrased as though anything has been verified. No score ⇒ no sentence, not a warning.
  const scoreRaw = clean(lead.credit_score)
  const score = Number(scoreRaw)
  if (scoreRaw && Number.isFinite(score) && score > 0) {
    sentences.push(
      score >= 680
        ? `Their reported credit score of ${scoreRaw} suggests strong credit.`
        : `Their reported credit score of ${scoreRaw} may need additional review.`,
    )
  }

  // ── Sentence 3: income, ONLY when supplied. The form does not currently ask for it, so this
  //    normally renders nothing at all — and its ABSENCE is never mentioned.
  const income = clean(lead.income)
  if (income) sentences.push(`They reported income of ${income}.`)

  return sentences.join(" ")
}
