/**
 * The compact "Why I chose this for you" presentation contract shared by the Map
 * property card and the Beast Companion Current Property card, so both surfaces
 * feel like the same system.
 *
 * PRESENTATION ONLY. Every field is DERIVED from data that already exists (the
 * existing evaluators / property + client context) — this contract adds NO
 * database columns and never fabricates. A card supplies only the categories it
 * can HONESTLY ground for THIS client; absent categories are simply omitted. The
 * selector then renders at most `MAX_REASON_LINES` short lines.
 *
 * The intent is "why Beast chose this property for this client" — NOT a dump of
 * everything known about the property. Full Property Intelligence stays behind the
 * scenes; only the strongest client-relevant reasons surface here.
 */
export type MatchReasonInput = {
  /** Preferred-area / geographic fit, e.g. "Within Preferred Area". */
  location?: string | null
  /** Commute or proximity, e.g. "10 min to Downtown". */
  commute?: string | null
  /** Approval / credit fit, e.g. "Credit Friendly". */
  approval?: string | null
  /** Requested property features the property confirms — FULL display labels
   *  (e.g. "Floor-to-Ceiling Windows", never "FTC Windows"). Collapsed into ONE
   *  line of at most `MAX_FEATURE_ITEMS` items joined by " · ". */
  features?: string[] | null
  /** Unusually strong pricing/special fit, e.g. "1 month free". */
  special?: string | null
}

/** Items the single feature line may show (centered-dot separated). */
export const MAX_FEATURE_ITEMS = 3
/** Total supporting reason lines beneath the Match Score. */
export const MAX_REASON_LINES = 3
/** The centered-dot separator for the feature line. */
export const FEATURE_SEPARATOR = " · "

const clean = (s: string | null | undefined): string => (s ?? "").trim()

/**
 * Select the strongest available reason lines for THIS client, capped at
 * `max` (default `MAX_REASON_LINES`). Priority mirrors the data-contract order:
 * location → commute → approval → features → special. (A fixed v1 heuristic —
 * there is no per-reason strength score yet; refine when the client-fit engine
 * can rank them.) The feature line is a single line of up to `MAX_FEATURE_ITEMS`
 * full labels joined by `FEATURE_SEPARATOR`. Empty/absent categories are skipped
 * (never forced), and exact duplicates are dropped, so a card shows only what is
 * meaningful for this client.
 */
export function selectMatchReasonLines(input: MatchReasonInput, max: number = MAX_REASON_LINES): string[] {
  const lines: string[] = []
  const push = (s: string) => {
    const t = clean(s)
    if (t && !lines.includes(t)) lines.push(t)
  }
  if (clean(input.location)) push(input.location!)
  if (clean(input.commute)) push(input.commute!)
  if (clean(input.approval)) push(input.approval!)
  const feats = (input.features ?? []).map(clean).filter(Boolean).slice(0, MAX_FEATURE_ITEMS)
  if (feats.length) push(feats.join(FEATURE_SEPARATOR))
  if (clean(input.special)) push(input.special!)
  return lines.slice(0, Math.max(0, max))
}
