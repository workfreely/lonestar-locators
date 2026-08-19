// Match % COLOUR band — presentation only.
//
// Deliberately separate from matchScore.ts: the score itself is settled, and how it is
// coloured must never drift into how it is calculated. Nothing here feeds the scoring
// weights, thresholds or dimensions.
//
// The band maps onto the Companion's existing semantic tone classes (the same
// good/moderate/bad vocabulary `.bc-intel-lead` already uses), so the colours come from
// the established --lb-success / --lb-warning / --lb-danger tokens rather than any new
// hard-coded value.

export type MatchScoreTone = "good" | "moderate" | "bad";

/** 80–100 → good (green), 61–79 → moderate (amber), 0–60 → bad (red). */
export function matchScoreTone(score: number): MatchScoreTone {
  if (score >= 80) return "good";
  if (score >= 61) return "moderate";
  return "bad";
}
