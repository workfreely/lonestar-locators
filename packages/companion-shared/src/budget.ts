// Budget V1 — the fourth Current Property intelligence row. Compact contract:
//
//   Budget: Within budget | Options within budget | $125 over budget
//
// Two inputs, both structured before they get here: the client's working budget
// (resolved from the SAME ClientContext every other evaluator uses) and the property's
// rent RANGE (parsed at extraction from SAD's confirmed price chip, never re-parsed
// from display text in the UI).
//
// The property figure is a PROPERTY-WIDE RANGE, not a selected unit's rent, so the
// evaluator is deliberately careful about what it claims. In particular it never says
// "$X under budget": we do not know which unit the client would take, so a range whose
// low end sits under the budget only tells us options exist, not what they'd pay.
//
// Unknown stays unknown: a missing client budget or an unparseable property rent yields
// null and the caller hides the row. Nothing is ever turned into $0, "within budget",
// or "over budget" by absence.

import type { ClientContext } from "./clientContext";
import { selectRentConcession } from "./specials";

export type MoneyRange = { min: number; max: number };

/**
 * Matching TOLERANCE — how far above the client's maximum a property can sit and still
 * be worth surfacing. A locator does not apply a hard cutoff: a property slightly over
 * budget is a real option, and a concession widens how far that stretches.
 *
 * This NEVER changes the client's actual budget. It only softens the Current Property
 * matching verdict, and it is not a net-effective-rent calculation — we still do not
 * claim what any particular unit would cost.
 *
 * Named so the tiers can be tuned without hunting through the comparison logic.
 */
export const BUDGET_TOLERANCE = {
  /** No meaningful rent concession. */
  none: 100,
  /** Around one month / 4+ weeks free. */
  meaningful: 200,
  /** Around 6–8+ weeks / 2 months free. */
  strong: 300,
} as const;

/** Free-period thresholds for the tiers above, in weeks (months are converted). */
const MEANINGFUL_MIN_WEEKS = 4;
const STRONG_MIN_WEEKS = 6;
const WEEKS_PER_MONTH = 52 / 12;

/**
 * The tolerance this property earns, from the EXISTING Specials intelligence — the same
 * `selectRentConcession` the Specials row uses, so there is no second parser and no new
 * extraction. Tiering is by the concession's stated free period; a dollar-off offer
 * states no free period and earns the base tolerance.
 *
 * A qualified offer ("Up to 8 weeks free") still counts here: this is a leniency for
 * deciding what is worth showing, not a claim about guaranteed rent. Net-effective rent
 * remains deliberately uncalculated.
 */
export function budgetTolerance(specialsLines?: string[] | null): number {
  const concession = selectRentConcession(specialsLines);
  const free = concession?.free;
  const weeks = free ? (free.unit === "weeks" ? free.amount : free.amount * WEEKS_PER_MONTH) : 0;
  if (weeks >= STRONG_MIN_WEEKS) return BUDGET_TOLERANCE.strong;
  if (weeks >= MEANINGFUL_MIN_WEEKS) return BUDGET_TOLERANCE.meaningful;
  return BUDGET_TOLERANCE.none;
}

/**
 * Parse a money range from free text: "$925 - $1,199" → { min: 925, max: 1199 };
 * "$1,600–$1,700" and "1600 to 1700" likewise. A single amount becomes a zero-width
 * range ("$1,200" → { min: 1200, max: 1200 }). Returns null when there is no usable
 * figure ("Call for pricing", empty, or only zeros), so callers can hide rather than
 * invent one. Bounds are ordered defensively in case the source lists them reversed.
 */
export function parseMoneyRange(text?: string | null): MoneyRange | null {
  const groups = String(text ?? "").match(/\d[\d,]*(?:\.\d+)?/g);
  if (!groups) return null;
  const values = groups.map((g) => Number(g.replace(/,/g, ""))).filter((n) => Number.isFinite(n) && n > 0);
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

// A budget stated in confirmed later text. Deliberately keyword-anchored: a bare dollar
// amount in a note ("paid $500 in fees") must never be mistaken for the client's budget.
const BUDGET_AFTER_KEYWORD =
  /\b(?:budget|max(?:imum)?|up\s+to|cap(?:ped)?|ceiling|afford|spend|limit)\b[^.$\n]{0,40}\$\s*([\d,]+)(?:\s*(?:-|–|—|to)\s*\$?\s*([\d,]+))?/gi;
const BUDGET_BEFORE_KEYWORD =
  /\$\s*([\d,]+)(?:\s*(?:-|–|—|to)\s*\$?\s*([\d,]+))?[^.\n]{0,20}?\b(?:budget|max(?:imum)?|cap|limit)\b/gi;

/**
 * Language that makes a stated amount a FLOOR rather than a ceiling — "flexible above
 * $2,500", "at least $1,800". Such a figure is the bottom of the client's range, so it
 * must never become the working MAX; doing so let a lower number act as the threshold
 * and wrongly narrowed the budget (e.g. "$2,500 – $3,000" collapsing to a 2,500 cap).
 * A stated RANGE is unaffected — its upper bound is still used.
 */
const FLOOR_PHRASE = /\b(above|over|at least|starting at|north of|more than|upwards? of)\b/i;

/** The LAST clearly-stated budget in a block of confirmed text, or null. Last wins —
 *  a later correction supersedes an earlier one within the same layer. */
function budgetFromText(text?: string | null): MoneyRange | null {
  const source = String(text ?? "");
  if (!source) return null;
  let bestIndex = -1;
  let best: MoneyRange | null = null;
  for (const re of [BUDGET_AFTER_KEYWORD, BUDGET_BEFORE_KEYWORD]) {
    re.lastIndex = 0; // these are /g — reset before each scan
    for (let m = re.exec(source); m; m = re.exec(source)) {
      // A single amount introduced by floor language states the BOTTOM of the range,
      // not a cap — ignore it so the structured range's upper bound stays the max.
      if (!m[2] && FLOOR_PHRASE.test(m[0])) continue;
      const range = parseMoneyRange([m[1], m[2]].filter(Boolean).join(" - "));
      if (range && m.index >= bestIndex) {
        bestIndex = m.index;
        best = range;
      }
    }
  }
  return best;
}

/**
 * The client's current working budget, following the precedence ClientContext already
 * documents:
 *   1. Smart Form / structured search criteria = the BASELINE.
 *   2. Locator Notes + AI Insights (`overrideText`) = the CONFIRMED later layer. A clear
 *      new/current/max budget there supersedes the baseline.
 *   3. Client Notes are context only and NEVER auto-supersede the structured budget.
 * Null when the client has no usable budget anywhere.
 */
export function resolveClientBudget(ctx: ClientContext): MoneyRange | null {
  return budgetFromText(ctx.overrideText) ?? parseMoneyRange(ctx.budgetText);
}

/**
 * Budget V1 → the single terse piece the row displays, or null to hide the row.
 *
 *   Within budget          — the property's ENTIRE range is at or below the client's max
 *   Options within budget  — the range straddles the max (some units qualify, some don't)
 *   Near budget            — the lowest rent is over, but within the earned TOLERANCE
 *   $N over budget         — beyond tolerance (N = property minimum − client maximum,
 *                            the true gap, never reduced by the tolerance)
 */
export function evaluateBudget(
  ctx: ClientContext,
  propertyRent?: MoneyRange | null,
  specialsLines?: string[] | null,
): string | null {
  const budget = resolveClientBudget(ctx);
  if (!budget || !propertyRent) return null; // unknown stays unknown — never a comparison
  const ceiling = budget.max;
  if (propertyRent.max <= ceiling) return "Within budget";
  if (propertyRent.min <= ceiling) return "Options within budget";
  const over = Math.round(propertyRent.min - ceiling);
  if (over <= budgetTolerance(specialsLines)) return "Near budget";
  return `$${over.toLocaleString("en-US")} over budget`;
}
