import { z } from "zod"

/**
 * CONVERSATION CRITERIA EXTRACTION — V1, location only.
 *
 * The model's ONLY job is to say what the client actually stated. It never writes
 * a database field, never decides whether a criterion should change, and never
 * sees the lead's current criteria. Deterministic code in reconcileLocation.ts
 * does all of that, so a model that hallucinates can at worst produce a fact that
 * reconciliation then refuses to act on.
 *
 * V1 extracts THREE things and nothing else: desired areas, a commute
 * destination, and a maximum drive time. Budget, move date, beds, amenities and
 * screening are deliberately out of scope until the location loop is proven.
 *
 * ── THE DISTINCTION THAT MATTERS MOST ───────────────────────────────────────
 * A DESIRED AREA is a general geographic preference ("Alamo Ranch", "Helotes",
 * "northwest side"). A DESTINATION is a specific anchor the client must be near
 * (workplace, base, school, hospital, street address). "I work at Lackland AFB"
 * is a destination and must never consume one of the two Desired Area slots —
 * that was the original Ka'Leah failure: a commute requirement recorded as an
 * area, which no area search could satisfy.
 *
 * ── CONFIDENCE IS A DECISION, NOT A NUMBER ──────────────────────────────────
 * `explicit` or `ambiguous`, never a fabricated percentage. Only `explicit`
 * facts are eligible to change active criteria. "Maybe Alamo Ranch", "I've heard
 * Westover Hills is nice" and "my friend lives near Lackland" are all
 * `ambiguous`: recognised internally, never written.
 */

/** How an area statement relates to what the client already told us. */
export const areaIntentSchema = z.enum([
  /** "Actually I'd rather stay around Helotes" — supersedes existing areas. */
  "replacement",
  /** "Alamo Ranch would also work" — adds to them. */
  "additive",
  /** A plain statement of current preference with no explicit relation. */
  "preference",
])
export type AreaIntent = z.infer<typeof areaIntentSchema>

export const confidenceSchema = z.enum(["explicit", "ambiguous"])
export type Confidence = z.infer<typeof confidenceSchema>

/**
 * The model's structured output. Kept as small as it can be while still letting
 * reconciliation make a safe decision: every field is optional because most
 * messages state none of them.
 */
export const locationFactsSchema = z.object({
  /** Named general areas the client expressed a preference for. */
  areas: z
    .array(
      z.object({
        name: z.string().min(1),
        intent: areaIntentSchema,
        confidence: confidenceSchema,
      }),
    )
    .default([]),
  /** The specific place they need to be near. Unresolved free text at this stage. */
  destination: z
    .object({
      /** Exactly as the client referred to it ("Lackland AFB", "123 Main Street"). */
      name: z.string().min(1),
      confidence: confidenceSchema,
    })
    .nullish(),
  /** An explicitly stated maximum drive time, in whole minutes. */
  maxDriveMinutes: z
    .object({
      minutes: z.number().int().positive().max(180),
      confidence: confidenceSchema,
    })
    .nullish(),
  /** The client's own words that justify the above — for audit, never for display. */
  evidence: z.string().default(""),
})

export type LocationFacts = z.infer<typeof locationFactsSchema>

export const EMPTY_FACTS: LocationFacts = { areas: [], destination: null, maxDriveMinutes: null, evidence: "" }

/**
 * Does this message plausibly contain a location statement at all?
 *
 * A deterministic pre-filter that runs BEFORE the model, because most inbound
 * texts ("ok thanks", "sounds good", "can we do 3pm?") state nothing about
 * location and a model call on them is pure waste. Deliberately generous: it
 * only has to avoid obvious non-candidates, and anything it lets through is
 * still judged by the model and then by reconciliation.
 *
 * It is a COST filter, never a safety filter — nothing is approved by passing it.
 */
const LOCATION_HINTS = [
  /\bmin(ute)?s?\b/i,
  /\bnear(by)?\b/i,
  /\bclose to\b/i,
  /\bwithin\b/i,
  /\bdriv(e|ing)\b/i,
  /\bcommut(e|ing)\b/i,
  /\bwork(s|ing)? (at|for|in)\b/i,
  /\bjob\b/i,
  /\bstay\b/i,
  /\bliv(e|ing)\b/i,
  /\bmove\b/i,
  /\barea\b/i,
  /\bside of town\b/i,
  /\bnorth|south|east|west\b/i,
  /\bzip\b/i,
  /\b\d{1,3}\s*(min|minutes)\b/i,
  /\b\d+\s+[A-Z][a-z]+\s+(St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Lane)\b/i,
  /\b(afb|air force base|base|hospital|medical center|university|college|campus|downtown)\b/i,
]

export function mayContainLocation(body: string | null | undefined): boolean {
  const text = String(body ?? "").trim()
  if (text.length < 2) return false
  // A short reply ("Alamo Ranch", "20 minutes") is usually an ANSWER to our own
  // question, so context decides it — never skip those on hint grounds alone.
  if (text.length <= 40) return true
  return LOCATION_HINTS.some((re) => re.test(text))
}
