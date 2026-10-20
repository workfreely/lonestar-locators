/**
 * AVERAGE RENT — what a concession is actually worth, spread over the lease.
 *
 * A client reading "$1,725/month" beside "Up to 10 Weeks Free" cannot tell what they would
 * really pay without doing arithmetic nobody does in their head. This computes it once, from
 * figures a person confirmed, and shows BOTH numbers so the discount is visible as a discount
 * rather than disguised as a lower rent.
 *
 * ── EVERY INPUT IS CONFIRMED, NOT PARSED ────────────────────────────────────────────────────
 * Nothing here reads property_catalog.current_special. "Up to 10 Weeks Free on Select Homes"
 * is a ceiling on an offer that may not apply to this client's floor plan, move-in date or
 * lease term, so the weeks used are the weeks the locator verified — typed in, for this client,
 * against this quote. The quoted rent is likewise the rent QUOTED for the qualifying unit, which
 * is not the catalog's general starting price and is never written back over it.
 *
 * ── THE CONVENTION, AND WHY IT MATTERS ──────────────────────────────────────────────────────
 *     months_free = weeks × 12 / 52            (a 52-week year)
 *     average     = (term − months_free) × rent / term
 * The alternative "4 weeks = 1 month" convention is wrong by real money: on 10 weeks free at
 * $1,725 over 15 months it gives $1,438 instead of $1,460 — $22 a month, $332 across the lease.
 * One convention, stated here, mirrored in SQL (lb_compose_average_rent), and held together by a
 * drift test that runs both over the same cases.
 *
 * Rounding happens ONCE, at the end, to whole dollars — the same treatment the bedroom price
 * line already gets, so the two numbers on a card are rounded the same way.
 *
 * ── IT FAILS CLOSED ─────────────────────────────────────────────────────────────────────────
 * Every uncertain or incoherent input returns null, and null renders nothing. A missing rent, a
 * missing term, a concession that swallows the lease, both units supplied at once — all silence.
 * Showing no average costs a client nothing; showing a wrong one costs them a lease.
 *
 * Utilities, deposits, fees and any other charge are excluded by construction: only base rent
 * goes in, so only base rent comes out.
 */

/** The four figures a locator confirms, plus the switch that lets a client see them. */
export type AverageRentInputs = {
  /** The rent QUOTED for the qualifying unit. Not the catalog starting price. */
  quotedRent?: number | null
  /** Confirmed weeks free. Mutually exclusive with concessionMonths. */
  concessionWeeks?: number | null
  /** Confirmed months free. Mutually exclusive with concessionWeeks. */
  concessionMonths?: number | null
  /** The qualifying lease term, in months. */
  leaseMonths?: number | null
  /** The locator's decision that THIS client should see it. Off by default. */
  show?: boolean | null
}

export type AverageRent = {
  /** The effective monthly base rent, whole dollars. */
  average: number
  /** The quoted rent it was derived from, whole dollars — shown alongside, never replaced. */
  quotedRent: number
  concessionWeeks: number | null
  concessionMonths: number | null
  leaseMonths: number
}

/** Months in a week, on a 52-week year. Exported so the drift test can state the constant. */
export const MONTHS_PER_WEEK = 12 / 52

function positive(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * The computed average, or null when it must not be shown.
 *
 * `show` is necessary but never sufficient: a locator can switch it on and still get nothing
 * until all four figures are present and coherent. That ordering is deliberate — the toggle
 * records an intention, the data decides whether the intention can be honoured.
 */
export function computeAverageRent(input: AverageRentInputs | null | undefined): AverageRent | null {
  if (!input || input.show !== true) return null

  const rent = positive(input.quotedRent)
  const term = positive(input.leaseMonths)
  const weeks = positive(input.concessionWeeks)
  const months = positive(input.concessionMonths)

  if (rent === null || term === null) return null
  // Ambiguous: two different statements of the same concession. Refuse rather than pick one.
  if (weeks !== null && months !== null) return null
  if (weeks === null && months === null) return null
  // A fractional lease term is not a thing anyone is quoted, and it would make the "15-month
  // lease" label a lie.
  if (!Number.isInteger(term)) return null

  const monthsFree = weeks !== null ? weeks * MONTHS_PER_WEEK : (months as number)
  // A concession that meets or exceeds the lease is not a discount, it is a mistyped figure.
  if (monthsFree >= term) return null

  const average = Math.round(((term - monthsFree) * rent) / term)
  if (!Number.isFinite(average) || average <= 0) return null

  return {
    average,
    quotedRent: Math.round(rent),
    concessionWeeks: weeks,
    concessionMonths: months,
    leaseMonths: term,
  }
}

/** "$1,460" — the same whole-dollar formatting the bedroom price line uses. */
export function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US")
}

/** "10 weeks free" · "1 week free" · "2 months free" · "1 month free". */
export function concessionPhrase(a: AverageRent): string {
  if (a.concessionWeeks !== null) {
    const w = a.concessionWeeks
    return `${+w.toFixed(2)} ${w === 1 ? "week" : "weeks"} free`
  }
  const m = a.concessionMonths as number
  return `${+m.toFixed(2)} ${m === 1 ? "month" : "months"} free`
}

/**
 * The exact client-facing line:
 *     Average Rent: $1,460/month · 10 weeks free · 15-month lease
 * Returns null when there is nothing to show, so a caller can render it or not on one check.
 */
export function averageRentLine(input: AverageRentInputs | null | undefined): string | null {
  const a = computeAverageRent(input)
  if (!a) return null
  return `Average Rent: ${money(a.average)}/month · ${concessionPhrase(a)} · ${a.leaseMonths}-month lease`
}

/**
 * The rent the BEDROOM LINE should quote.
 *
 * When a qualifying quote is confirmed and the average is being shown, both numbers on the card
 * must describe the same unit — otherwise a client compares a discount on one apartment against
 * the starting price of another. Otherwise null, and the caller keeps the catalog-derived
 * starting rent exactly as before.
 */
export function bedroomLineRentOverride(input: AverageRentInputs | null | undefined): number | null {
  return computeAverageRent(input)?.quotedRent ?? null
}
