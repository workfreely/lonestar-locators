import { MAX_LOCATIONS } from "@/lib/formOptions"
import { csvToArr } from "@/lib/leads/leadFormValues"

/**
 * THE AREA SELECTION LIMIT — one definition of "how many places may a client pick".
 *
 * The rule is a COMBINED total across Preferred Neighborhoods (`leads.neighborhoods`)
 * and Nearby Areas (`leads.submarkets`): a client may have 0, 1 or 2 areas, never 3+.
 * It is NOT 2 in each section. The two columns are two inputs onto one allowance,
 * which is also how matching reads them (see composeDesiredAreas in
 * lib/propertyExplorer/multiArea.ts).
 *
 * WHY A SHARED MODULE. Six surfaces can write these columns — the Smart Lead Form,
 * Add Lead, Edit Client, the two legacy Lone Star forms, and /api/leads/submit — and
 * Edit Client writes DIRECTLY to Supabase from the browser rather than through the
 * API route. A cap implemented per-surface is a cap that one surface forgets, so the
 * counting and the verdict live here and every surface asks this module.
 *
 * LEGACY LEADS ARE NEVER TRUNCATED. 9 of 26 production leads already exceed the cap
 * (three of them hold 12 areas, written by a "Select All" control this pass removes).
 * Choosing two of someone's twelve on their behalf would be inventing a preference
 * they never expressed, so an over-cap lead keeps every saved value, stays editable,
 * and is only ever required to move DOWNWARD — see `verdictForWrite`.
 */

/** Max areas a client may hold, across BOTH columns combined.
 *  Typed as `number`, not the literal, so comparing against it is never narrowed
 *  away by TypeScript when the constant changes value. */
export const MAX_AREA_SELECTIONS: number = MAX_LOCATIONS

/** Combined count across both columns. Accepts the stored CSV or an array. */
export function countAreaSelections(
  neighborhoods: string | string[] | null | undefined,
  submarkets: string | string[] | null | undefined,
): number {
  const n = Array.isArray(neighborhoods) ? neighborhoods.filter(Boolean).length : csvToArr(neighborhoods ?? "").length
  const s = Array.isArray(submarkets) ? submarkets.filter(Boolean).length : csvToArr(submarkets ?? "").length
  return n + s
}

/**
 * Is this client at (or past) the limit — i.e. must ADDING be refused?
 *
 * Deliberately `>=`, so a legacy lead holding more than the cap is also "at" it:
 * adding is refused, removing stays available. That is the whole legacy behaviour —
 * no special case, no migration, no truncation.
 */
export function isAtAreaLimit(
  neighborhoods: string | string[] | null | undefined,
  submarkets: string | string[] | null | undefined,
): boolean {
  return countAreaSelections(neighborhoods, submarkets) >= MAX_AREA_SELECTIONS
}

export type AreaWriteVerdict =
  | { ok: true }
  | { ok: false; count: number; limit: number; message: string }

/**
 * May this write be saved?
 *
 * `previousCount` is what the lead holds TODAY (omit for a brand-new lead). The two
 * accepted shapes:
 *   • at or under the cap                        → always fine
 *   • over the cap, but FEWER than before        → fine; a legacy lead reducing
 *
 * Everything else is refused, which covers both "a third selection" and "an over-cap
 * legacy lead trying to grow or hold steady". Refusing rather than trimming is the
 * point: trimming would silently pick which areas survive.
 */
export function verdictForWrite(
  neighborhoods: string | string[] | null | undefined,
  submarkets: string | string[] | null | undefined,
  previousCount?: number,
): AreaWriteVerdict {
  const count = countAreaSelections(neighborhoods, submarkets)
  if (count <= MAX_AREA_SELECTIONS) return { ok: true }
  if (previousCount !== undefined && count < previousCount) return { ok: true }

  const noun = MAX_AREA_SELECTIONS === 1 ? "area" : "areas"
  return {
    ok: false,
    count,
    limit: MAX_AREA_SELECTIONS,
    message:
      previousCount !== undefined && previousCount > MAX_AREA_SELECTIONS
        ? `This client has ${previousCount} saved areas, more than the current limit of ${MAX_AREA_SELECTIONS}. Remove areas to continue — none can be added until ${MAX_AREA_SELECTIONS} or fewer remain.`
        : `Choose at most ${MAX_AREA_SELECTIONS} ${noun} in total across Preferred Neighborhoods and Nearby Areas (received ${count}).`,
  }
}

/**
 * The label every surface shows under the pickers, so the number is never typed by
 * hand into copy that then drifts from the constant.
 */
export function areaLimitHint(): string {
  return `up to ${MAX_AREA_SELECTIONS} total (Preferred Neighborhoods + Nearby Areas)`
}
